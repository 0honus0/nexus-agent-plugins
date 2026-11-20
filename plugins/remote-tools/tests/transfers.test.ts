import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { Ssh } from '../../ssh/src/node/ssh-api.js';
import { RemoteTools, type RemoteToolsSessionApi } from '../src/node/remote-tools-api.js';
import { RemoteCommandExecutor } from '../src/node/remote-command.js';
import { testScope } from './fixtures/scope.js';
import { RemoteTransfer } from '../src/node/remote-transfer';
import type { RemoteTransferTarget } from '../src/shared/remote-transfer-types';

// Native integration needs an isolated root-owned OpenSSH daemon; unit tests remain portable.
describe.skipIf(
	process.getuid?.() !== 0 ||
		!['/usr/sbin/sshd', '/usr/bin/ssh', '/usr/bin/rsync', '/usr/bin/scp', '/usr/bin/ssh-keygen'].every(existsSync),
)('native OpenSSH transfers', () => {
	let root: string, daemon: ChildProcess, port: number, target: RemoteTransferTarget;
	const lifetime = new AbortController();
	const ssh = new Ssh(lifetime.signal, { report() {} });
	const scope = testScope();
	let connection: Awaited<ReturnType<typeof ssh.connect>>;
	let session: RemoteToolsSessionApi;
	let daemonLog = '';
	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'nexus-native-transfer-'));
		await promisify(execFile)('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', join(root, 'host')]);
		await promisify(execFile)('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', join(root, 'client')]);
		const raw = Buffer.from((await readFile(join(root, 'host.pub'), 'utf8')).split(' ')[1], 'base64');
		const fingerprint = 'SHA256:' + createHash('sha256').update(raw).digest('base64').replace(/=+$/, '');
		const reservation = createServer();
		await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
		port = (reservation.address() as { port: number }).port;
		await new Promise<void>((resolve) => reservation.close(() => resolve()));
		await mkdir('/run/sshd', { recursive: true });
		const config = [
			'Port ' + port,
			'ListenAddress 127.0.0.1',
			'HostKey ' + join(root, 'host'),
			'PidFile ' + join(root, 'pid'),
			'AuthorizedKeysFile ' + join(root, 'client.pub'),
			'StrictModes no',
			'PubkeyAuthentication yes',
			'PasswordAuthentication no',
			'KbdInteractiveAuthentication no',
			'UsePAM no',
			'PermitRootLogin yes',
			'Subsystem sftp internal-sftp',
		].join('\n');
		await writeFile(join(root, 'sshd_config'), config);
		daemon = spawn('/usr/sbin/sshd', ['-D', '-e', '-f', join(root, 'sshd_config')], {
			stdio: ['ignore', 'ignore', 'pipe'],
		});
		daemon.stderr!.on('data', (chunk: Buffer) => {
			daemonLog = (daemonLog + chunk.toString()).slice(-16384);
		});
		const privateKey = await readFile(join(root, 'client'), 'utf8');
		target = {
			host: '127.0.0.1',
			port,
			username: userInfo().username,
			hostKey: Uint8Array.from(raw),
			fingerprint,
			authentication: { type: 'key', privateKey },
		};
		await vi.waitFor(
			async () => {
				connection = await ssh.connect({
					host: target.host,
					port,
					username: target.username,
					privateKey,

					hostVerifier: (key: Buffer) => Buffer.from(key).equals(raw),

					readyTimeout: 1000,
					signal: lifetime.signal,
				});
			},
			{ timeout: 5000, interval: 100 },
		);
		session = new RemoteTools(scope).bind(connection, scope);
	}, 15000);

	afterAll(async () => {
		await scope.stop();
		lifetime.abort();
		await ssh.close();
		daemon?.kill();
		if (daemon && daemon.exitCode === null)
			await new Promise<void>((resolve) => daemon.once('exit', () => resolve()));
		if (root) await rm(root, { recursive: true, force: true });
	});

	it('copies real bytes through native rsync and SCP, including spaces and shell metacharacters', async () => {
		const source = join(root, 'file $(not-a-command).txt');
		await writeFile(source, Buffer.alloc(3 * 1024 * 1024, 73));
		for (const method of ['rsync', 'scp']) {
			const destination = join(root, 'stage ' + method);
			await mkdir(destination);
			const commands = new RemoteCommandExecutor(connection);
			const transfer = new RemoteTransfer(
				connection,
				{
					script: (script, signal, options) =>
						script.includes('command -v rsync')
							? Promise.resolve({ stdout: '', stderr: '', code: 1 })
							: commands.script(script, signal, options),

					stream: (script, signal, output) => commands.stream(script, signal, output),
				},
				lifetime.signal,
			);
			const methods: string[] = [];
			const copy = method === 'rsync' ? session.copyFiles.bind(session) : transfer.copy.bind(transfer);
			const result = await copy(
				{ paths: [source], destination, target, filesOnly: true },
				{
					signal: lifetime.signal,

					onMethod: (method) => methods.push(method),
				},
			);
			expect(result).toEqual({ state: 'copied', method });
			expect(methods).toEqual([method]);
			expect(await readFile(join(destination, source.split('/').pop()!))).toEqual(await readFile(source));
		}
	}, 20000);

	it('falls back only before dispatch, rejects untrusted host keys and preserves native exit codes', async () => {
		const source = join(root, 'source');
		await writeFile(source, 'content');
		const result = await session.copyFiles({
			paths: [source],
			destination: root,
			target: { ...target, port: 1 },
			filesOnly: true,
		});
		expect(result).toEqual({ state: 'unavailable', reason: 'unreachable' });
		expect(
			await session.copyFiles({
				paths: [source],
				destination: join(root, 'missing-stage'),
				target,
				filesOnly: true,
			}),
		).toEqual({ state: 'unavailable', reason: 'unreachable' });
		await expect(
			session.copyFiles({
				paths: [source],
				destination: root,
				target: { ...target, fingerprint: 'SHA256:' + 'a'.repeat(43) },
				filesOnly: true,
			}),
		).rejects.toMatchObject({ code: 'REMOTE_TOOLS_TRANSFER_HOST_KEY' });
		try {
			await expect(
				session.copyFiles({ paths: [source + '.missing'], destination: root, target, filesOnly: true }),
			).rejects.toMatchObject({ level: 'remote-exit' });
		} catch (cause) {
			// Fixture commands contain generated paths only; never capture authentication material.
			throw new Error(daemonLog, { cause });
		}
	}, 20000);
});
