import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function startProvider(resources: AsyncDisposableStack) {
	const directory = await mkdtemp(join(tmpdir(), 'nexus-oidc-fixture-'));
	resources.defer(() => rm(directory, { recursive: true, force: true }));
	const certificateAuthority = join(directory, 'cert.pem');
	const key = join(directory, 'key.pem');
	await exec('openssl', [
		'req',
		'-x509',
		'-newkey',
		'rsa:2048',
		'-nodes',
		'-days',
		'1',
		'-subj',
		'/CN=sdk-repository.test',
		'-addext',
		'subjectAltName=DNS:sdk-repository.test',
		'-keyout',
		key,
		'-out',
		certificateAuthority,
	]);

	const clientId = 'fixture-client';
	const secret = 'fixture-client-secret';
	const ownerSubject = 'fixture-owner';
	const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'fixture' };
	const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string }>();
	let tokensIssued = 0;
	let subject = ownerSubject;
	let validSignature = true;
	let issuer: string;

	const server = createServer(
		{ key: await readFile(key), cert: await readFile(certificateAuthority) },
		async (req, res) => {
			const url = new URL(req.url ?? '/', issuer);

			const json = (data: object, status = 200) =>
				res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(data));

			switch (url.pathname) {
				case '/.well-known/openid-configuration':
					return json({
						issuer,
						authorization_endpoint: issuer + '/authorize',
						token_endpoint: issuer + '/token',
						jwks_uri: issuer + '/jwks',
						response_types_supported: ['code'],
						subject_types_supported: ['public'],
						id_token_signing_alg_values_supported: ['RS256'],
						token_endpoint_auth_methods_supported: ['client_secret_basic'],
						code_challenge_methods_supported: ['S256'],
					});
				case '/jwks':
					return json({ keys: [jwk] });
				case '/authorize': {
					const redirectUri = url.searchParams.get('redirect_uri');
					const state = url.searchParams.get('state');
					const nonce = url.searchParams.get('nonce');
					const challenge = url.searchParams.get('code_challenge');
					if (
						!redirectUri ||
						!state ||
						!nonce ||
						!challenge ||
						url.searchParams.get('scope') !== 'openid' ||
						url.searchParams.get('response_type') !== 'code' ||
						url.searchParams.get('code_challenge_method') !== 'S256' ||
						url.searchParams.get('client_id') !== clientId
					)
						return json({ error: 'invalid_request' }, 400);
					const code = randomUUID();
					codes.set(code, { nonce, challenge, redirectUri });
					const callback = new URL(redirectUri);
					callback.searchParams.set('state', state);
					callback.searchParams.set('code', code);
					return res.writeHead(303, { location: callback.href }).end();
				}
				case '/token': {
					let body = '';
					for await (const chunk of req) body += chunk;
					const fields = new URLSearchParams(body);
					const code = fields.get('code') ?? '';
					const verifier = fields.get('code_verifier') ?? '';
					const value = codes.get(code);
					const encodedCredentials = /^Basic (\S+)$/iu.exec(req.headers.authorization ?? '')?.[1];
					const [encodedId, encodedSecret] = Buffer.from(encodedCredentials ?? '', 'base64')
						.toString()
						.split(':');
					const credentials = new URLSearchParams(`id=${encodedId}&secret=${encodedSecret}`);
					if (
						!value ||
						credentials.get('id') !== clientId ||
						credentials.get('secret') !== secret ||
						fields.get('grant_type') !== 'authorization_code' ||
						fields.get('redirect_uri') !== value.redirectUri ||
						createHash('sha256').update(verifier).digest('base64url') !== value.challenge
					)
						return json({ error: 'invalid_grant' }, 400);
					codes.delete(code);
					const now = Math.floor(Date.now() / 1000);
					const payload = {
						iss: issuer,
						aud: clientId,
						sub: subject,
						nonce: value.nonce,
						iat: now,
						exp: now + 180,
					};
					const parts = [JSON.stringify({ alg: 'RS256', kid: 'fixture' }), JSON.stringify(payload)];
					const unsigned = parts.map((part) => Buffer.from(part).toString('base64url')).join('.');
					const signature = sign('RSA-SHA256', Buffer.from(unsigned), privateKey);
					if (!validSignature) signature[0] ^= 1;
					tokensIssued++;
					return json({
						access_token: randomUUID(),
						token_type: 'Bearer',
						id_token: unsigned + '.' + signature.toString('base64url'),
					});
				}
				default:
					return json({ error: 'not_found' }, 404);
			}
		},
	);
	resources.defer(() => {
		server.closeAllConnections();
		if (server.listening) return new Promise<void>((resolve) => server.close(() => resolve()));
	});
	server.listen(0, '0.0.0.0');
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('OIDC_FIXTURE_NOT_LISTENING');
	issuer = 'https://sdk-repository.test:' + address.port;
	return {
		certificateAuthority,
		clientId,
		secret,
		ownerSubject,
		issuer,

		setSubject(value: string) {
			subject = value;
		},

		setValidSignature(value: boolean) {
			validSignature = value;
		},

		get tokensIssued() {
			return tokensIssued;
		},
	};
}
