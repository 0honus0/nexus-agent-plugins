import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ssh2, { type Connection } from 'ssh2';
import { expect, it } from 'vitest';
import { pluginFixture, setEnabled, startHost, until } from '../../test/tests/host.js';
import plugin from '../package.json' with { type: 'json' };

const sshId = '@nexus-terminal/ssh';
const consumerId = '@nexus-terminal/remote-tools-test-consumer';
const route = '/api/plugins/' + encodeURIComponent(consumerId) + '/command';

it('installs the extension and cleans up a live SSH operation when its consumer stops', async () => {
	await using resources = new AsyncDisposableStack();
	const directory = await mkdtemp(join(tmpdir(), 'nexus-remote-tools-consumer-'));
	resources.defer(() => rm(directory, { recursive: true, force: true }));
	await mkdir(join(directory, 'dist'));
	await writeFile(
		join(directory, 'package.json'),
		JSON.stringify({
			name: consumerId,
			version: '1.0.0',
			type: 'module',
			peerDependencies: { 'nexus-terminal': '^1.1.0' },
			files: ['dist'],
			nexus: {
				kind: 'extension',
				entry: { backend: 'dist/index.js' },
				dependsOn: { [sshId]: '^0.0.1-dev.1', [plugin.name]: '^' + plugin.version },
			},
		}),
	);
	await writeFile(join(directory, 'dist/index.js'), consumerEntry);

	const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
	const parsed = ssh2.utils.parseKey(key);
	if (parsed instanceof Error) throw parsed;

	let started = false;
	let stopped = false;
	const peers = new Set<Connection>();
	const server = new ssh2.Server({ hostKeys: [key] }, (peer) => {
		peers.add(peer);
		peer.on('error', () => {});
		peer.on('close', () => peers.delete(peer));
		peer.on('authentication', (request) => {
			if (request.method === 'password' && request.username === 'fixture' && request.password === 'fixture-only')
				request.accept();
			else request.reject(['password']);
		});
		peer.on('ready', () => {
			peer.on('session', (accept) => {
				const session = accept();
				session.on('exec', (accept, reject, info) => {
					if (info.command === 'true') {
						const channel = accept();
						channel.write('ready');
						channel.exit(0);
						channel.end();
					} else if (info.command === 'sleep 30') {
						const channel = accept();

						const closed = () => {
							stopped = true;
						};

						channel.once('close', closed);
						// 停用也可能先断开传输，服务端此时只转发连接的 close。
						peer.once('close', closed);
						started = true;
					} else reject();
				});
			});
		});
	});
	resources.defer(async () => {
		for (const peer of peers) peer.end();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	server.listen(0, '0.0.0.0');
	await once(server, 'listening');

	const host = await startHost(resources, consumerId, [
		pluginFixture(new URL('../../ssh/', import.meta.url), sshId),
		pluginFixture(new URL('../', import.meta.url), plugin.name),
		{ directory },
	]);
	const input = {
		port: (server.address() as AddressInfo).port,
		fingerprint: createHash('sha256').update(parsed.getPublicSSH()).digest('hex'),
	};
	expect(await host.json(route, { ...input, hold: false })).toEqual({ stdout: 'ready', code: 0 });

	const request = host
		.request(route, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...input, hold: true }),
		})
		.then(
			(response) => response.body?.cancel(),
			() => undefined,
		);
	await until(async () => started || undefined);
	await setEnabled(host, consumerId, false);
	await until(async () => stopped || undefined);
	await request;
}, 30000);

const consumerEntry = `
import { z } from 'zod';
export function activate(context) {
	context.use({
		ssh: ['@nexus-terminal/ssh', 'ssh'],
		tools: ['@nexus-terminal/remote-tools', 'remoteTools'],
	}, (scope) => {
		context.app.http.register([{
			method: 'post',
			path: '/command',
			lifetime: scope,
			input: z.strictObject({ port: z.number(), fingerprint: z.string(), hold: z.boolean() }),
			output: z.strictObject({ stdout: z.string(), code: z.number().nullable() }),
			async handler({ port, fingerprint, hold }, signal) {
				const connection = await scope.plugin.ssh.connect({
					host: 'sdk-repository.test', port, username: 'fixture', password: 'fixture-only',
					hostHash: 'sha256', hostVerifier: (value) => value === fingerprint, signal: scope.signal,
				});
				scope.onDispose(() => connection.close());
				const remote = scope.plugin.tools.bind(connection, scope);
				try {
					const { stdout, code } = await remote.execute(
						hold ? { executable: 'sleep', args: ['30'], timeoutMs: null } : { executable: 'true' },
						{ signal },
					);
					return { stdout, code };
				} finally {
					await remote.close();
					await connection.close();
				}
			},
		}]);
		context.self.readiness.set({ state: 'ready' });
	});
}
`;
