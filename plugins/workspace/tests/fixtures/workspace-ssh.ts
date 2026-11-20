import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import ssh2, { type Connection, type ServerChannel } from 'ssh2';
import { mountTestSftp } from './sftp-server.js';
import { statusSample } from './status-sample.js';

export async function startWorkspaceSsh(
	resources: AsyncDisposableStack,
	directory: string,
	beforeRead?: (path: string) => Promise<void>,
) {
	const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' });
	const parsed = ssh2.utils.parseKey(key);
	if (parsed instanceof Error) throw parsed;

	const fingerprint =
		'SHA256:' + createHash('sha256').update(parsed.getPublicSSH()).digest('base64').replace(/=+$/u, '');
	const channels: ServerChannel[] = [];
	const peers = new Set<Connection>();
	let samples = 0;
	const server = new ssh2.Server({ hostKeys: [key] }, (peer) => {
		peers.add(peer);
		peer.on('error', () => {});
		peer.once('close', () => peers.delete(peer));
		peer.on('authentication', (request) => {
			if (request.method === 'password' && request.username === 'fixture' && request.password === 'fixture-only')
				request.accept();
			else request.reject(['password']);
		});
		peer.on('ready', () =>
			peer.on('session', (accept) => {
				const session = accept();
				session.on('pty', (allow) => allow?.());
				session.on('window-change', (allow) => allow?.());
				session.on('shell', (allow) => {
					const shell = allow();
					shell.resume();
					channels.push(shell);
				});
				session.on('exec', (allow, reject, info) => {
					// Only the synthetic Linux sample is emulated. Nothing executes on the test host.
					if (!info.command.includes('__NEXUS_STATUS_MEMINFO__')) return reject();
					const channel = allow();
					channel.write(statusSample(++samples));
					channel.exit(0);
					channel.end();
				});
				mountTestSftp(session, directory, beforeRead);
			}),
		);
	});
	resources.defer(async () => {
		for (const peer of peers) peer.end();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	server.listen(0, '0.0.0.0');
	await once(server, 'listening');
	return { fingerprint, channels, peers, port: (server.address() as AddressInfo).port };
}
