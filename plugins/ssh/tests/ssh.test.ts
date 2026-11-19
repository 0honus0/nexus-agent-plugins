import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { createServer, Socket, type AddressInfo } from 'node:net';
import { afterEach, beforeEach, it } from 'node:test';
import type { PluginContextApi, PluginLogInput, PluginModuleApi } from 'nexus-terminal/node';
import ssh2, { type ClientChannel, type Connection, type Server, type ServerChannel } from 'ssh2';
import type { SshApi, SshConnectOptions } from '../src/node/ssh-api.js';

const { activate }: Pick<PluginModuleApi, 'activate'> = await import(
	new URL('../dist/node/index.js', import.meta.url).href
);

const hostKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
	type: 'pkcs1',
	format: 'pem',
});
const parsed = ssh2.utils.parseKey(hostKey);
if (parsed instanceof Error) throw parsed;
const fingerprint = createHash('sha256').update(parsed.getPublicSSH()).digest('hex');
let server: Server;
let port: number;
let peers: Set<Connection>;
let context: AbortController;
let ssh: SshApi;
let cleanup: (() => void | Promise<void>) | undefined;
let ready: unknown;
let onAuthentication: (() => void) | undefined;
let onSession: (() => void) | undefined;
let logs: PluginLogInput[];
let holdAuthentication = false;
let holdChannel = false;
let resized: ReturnType<typeof Promise.withResolvers<number[]>>;
let negotiatedCipher = '';
let file: Buffer;
let forwardTarget: { onForward?: (channel: ServerChannel) => void };

beforeEach(async () => {
	holdAuthentication = holdChannel = false;
	onAuthentication = onSession = undefined;
	negotiatedCipher = '';
	resized = Promise.withResolvers<number[]>();
	file = Buffer.from('remote file');
	forwardTarget = {};
	peers = new Set();
	logs = [];
	context = new AbortController();
	activate({
		signal: context.signal,
		app: { log: { report: (event: PluginLogInput) => logs.push(event) } },
		self: {
			readiness: {
				set: (value: unknown) => {
					ready = value;
				},
			},
		},

		provide: (name: string, value: SshApi) => {
			assert.equal(name, 'ssh');
			ssh = value;
		},

		onDispose: (value: () => void | Promise<void>) => {
			cleanup = value;
		},
	} as unknown as PluginContextApi);
	server = new ssh2.Server({ hostKeys: [hostKey] }, (peer) => {
		peers.add(peer);
		peer.on('close', () => peers.delete(peer));
		peer.on('error', () => {});
		peer.on('handshake', (value) => {
			negotiatedCipher = value.cs.cipher;
		});
		peer.on('authentication', (ctx) => {
			onAuthentication?.();
			if (holdAuthentication) return;
			if (ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'test-secret') ctx.accept();
			else ctx.reject(['password']);
		});
		peer.on('ready', () => {
			peer.on('tcpip', (accept) => {
				const channel = accept();
				if (forwardTarget.onForward) forwardTarget.onForward(channel);
				else channel.on('data', (data: Buffer) => channel.write(data));
			});
			peer.on('session', (accept) => {
				onSession?.();
				if (holdChannel) return;
				const session = accept();
				session.on('pty', (accept) => accept?.());
				session.on('window-change', (accept, _reject, info) => {
					resized.resolve([info.rows, info.cols]);
					accept?.();
				});
				session.on('env', (accept) => accept?.());
				session.on('shell', (accept) => {
					const channel = accept();
					channel.on('data', (data: Buffer) => channel.write(data));
				});
				session.on('exec', (accept, reject, info) => {
					if (info.command === 'reject') {
						reject?.();
						return;
					}
					const channel = accept();
					channel.write('output:' + info.command);
					channel.stderr.write('stderr');
					channel.exit(7);
					channel.end();
				});
				session.on('sftp', (accept) => {
					const sftp = accept();
					sftp.on('OPEN', (id) => sftp.handle(id, Buffer.from([1])));
					sftp.on('FSTAT', (id) =>
						sftp.attrs(id, {
							mode: 0o100644,
							uid: 0,
							gid: 0,
							size: file.length,
							atime: 0,
							mtime: 0,
						}),
					);
					sftp.on('READ', (id, _handle, offset, length) =>
						offset >= file.length
							? sftp.status(id, ssh2.utils.sftp.STATUS_CODE.EOF)
							: sftp.data(id, file.subarray(offset, offset + length)),
					);
					sftp.on('CLOSE', (id) => sftp.status(id, ssh2.utils.sftp.STATUS_CODE.OK));
				});
			});
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
	await cleanup?.();
	for (const peer of peers) peer.end();
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

const options = () => ({
	host: '127.0.0.1',
	port,
	username: 'tester',
	password: 'test-secret',
	hostHash: 'sha256',

	hostVerifier: (hash: string) => hash === fingerprint,
});

async function readExec(channel: ClientChannel) {
	let stdout = '';
	let stderr = '';
	channel.on('data', (data: Buffer) => {
		stdout += data;
	});
	channel.stderr.on('data', (data: Buffer) => {
		stderr += data;
	});
	const [exit] = await once(channel, 'close');
	return { stdout, stderr, exit };
}

it('activates the packaged service and negotiates AES-GCM and ChaCha20', { timeout: 8000 }, async () => {
	assert.deepEqual(ready, { state: 'ready' });
	for (const cipher of ['aes128-gcm@openssh.com', 'chacha20-poly1305@openssh.com'] as const) {
		const connection = await ssh.connect({ ...options(), algorithms: { cipher: [cipher] } });
		assert.equal(negotiatedCipher, cipher);
		assert.deepEqual(await readExec(await connection.exec('test')), {
			stdout: 'output:test',
			stderr: 'stderr',
			exit: 7,
		});
		await connection.close();
	}
});

it('supports independent simultaneous commands, PTY, resize and streams', { timeout: 8000 }, async () => {
	const connection = await ssh.connect(options());
	const results = await Promise.all(['one', 'two'].map(async (command) => readExec(await connection.exec(command))));
	assert.deepEqual(
		results.map((value) => value.stdout),
		['output:one', 'output:two'],
	);

	const shell = await connection.shell({ pty: { rows: 24, cols: 80, term: 'xterm-256color' } });
	const data = once(shell, 'data');
	shell.write('hello');
	assert.equal((await data)[0].toString(), 'hello');
	shell.setWindow(30, 100, 0, 0);
	assert.deepEqual(await resized.promise, [30, 100]);
	shell.close();
	assert.equal(connection.getState().state, 'connected');

	const noPty = await connection.shell({ pty: false });
	noPty.close();
});

it('supports SFTP and direct TCP forwarding', { timeout: 8000 }, async () => {
	const connection = await ssh.connect(options());
	const sftp = await connection.sftp();
	const contents = await new Promise<Buffer>((resolve, reject) =>
		sftp.readFile('/example', (error, data) => (error ? reject(error) : resolve(data))),
	);
	assert.equal(contents.toString(), 'remote file');
	sftp.end();

	const forwarded = await connection.forwardOut('127.0.0.1', 1234, 'remote.example', 80);
	const data = once(forwarded, 'data');
	forwarded.write('forwarded');
	assert.equal((await data)[0].toString(), 'forwarded');
	forwarded.close();
});

it('uses a forwarded stream as a jump connection and closes it independently', { timeout: 8000 }, async () => {
	const jump = await ssh.connect(options());
	forwardTarget.onForward = (channel) => {
		const socket = new Socket();
		socket.on('error', () => channel.destroy());
		channel.once('close', () => socket.destroy());
		socket.connect(port, '127.0.0.1');
		channel.pipe(socket).pipe(channel);
	};

	const sock = await jump.forwardOut('127.0.0.1', 1234, '127.0.0.1', port);
	const target = await ssh.connect({ ...options(), sock });
	assert.equal((await readExec(await target.exec('jumped'))).stdout, 'output:jumped');
	await target.close();
	assert.equal(jump.getState().state, 'connected');
});

it('requires host verification and maps authentication and verification errors safely', { timeout: 8000 }, async () => {
	await assert.rejects(ssh.connect({ ...options(), hostVerifier: undefined } as unknown as SshConnectOptions), {
		code: 'SSH_INVALID_OPTIONS',
	});
	await assert.rejects(ssh.connect({ ...options(), password: 'wrong-secret' }), {
		code: 'SSH_AUTHENTICATION_FAILED',
	});
	await assert.rejects(
		ssh.connect({
			...options(),

			hostVerifier: () => false,
		}),
		{
			code: 'SSH_HOST_KEY_REJECTED',
		},
	);
	await assert.rejects(
		ssh.connect({
			...options(),

			hostVerifier: () => {
				throw new Error('private-secret');
			},
		}),
		{ code: 'SSH_HOST_KEY_REJECTED' },
	);
	assert.doesNotMatch(JSON.stringify(logs), /wrong-secret|private-secret|test-secret|tester|127\.0\.0\.1/u);

	const connection = await ssh.connect({
		...options(),

		hostVerifier: (hash: string, done: (value: boolean) => void) => {
			queueMicrotask(() => done(hash === fingerprint));
		},
	});
	await connection.close();
});

it('isolates channel denial from the other requests on the connection', { timeout: 8000 }, async () => {
	const connection = await ssh.connect(options());
	const output = readExec(await connection.exec('ok'));
	await assert.rejects(connection.exec('reject'), { code: 'SSH_CHANNEL_FAILED' });
	assert.equal((await output).exit, 7);
	assert.equal(connection.getState().state, 'connected');
});

it('handles invalid options, forced DNS family and handshake timeout', { timeout: 8000 }, async () => {
	await assert.rejects(ssh.connect({ ...options(), privateKey: 'invalid' }), {
		code: 'SSH_INVALID_OPTIONS',
	});
	await (await ssh.connect({ ...options(), host: 'localhost', forceIPv4: true })).close();
	holdAuthentication = true;
	await assert.rejects(ssh.connect({ ...options(), readyTimeout: 100 }), {
		code: 'SSH_CONNECTION_TIMEOUT',
	});
});

it(
	'shuts down every open connection and pending handshake when the host disposes the plugin',
	{ timeout: 8000 },
	async () => {
		const connection = await ssh.connect(options());
		const states: string[] = [];
		connection.onStateChange((value) => states.push(value.state));
		connection.onStateChange(() => {
			throw new Error('listener-secret');
		});
		const session = await connection.shell();
		const sessionClosed = once(session.resume(), 'close');

		holdAuthentication = true;
		const authentication = Promise.withResolvers<void>();
		onAuthentication = authentication.resolve;
		const pending = assert.rejects(ssh.connect(options()), { code: 'SSH_CONNECTION_CLOSED' });
		await authentication.promise;

		context.abort();
		await cleanup?.();
		await pending;
		await sessionClosed;
		assert.deepEqual(states, ['closing', 'closed']);
		assert.doesNotMatch(JSON.stringify(logs), /listener-secret/u);
		await connection.close();
		await assert.rejects(ssh.connect(options()), { code: 'SSH_PLUGIN_STOPPED' });
	},
);

it('consumer cancel only closes its connection and rejects a pending channel', { timeout: 8000 }, async () => {
	const consumer = new AbortController();
	const first = await ssh.connect({ ...options(), signal: consumer.signal });
	const second = await ssh.connect(options());
	holdChannel = true;
	const session = Promise.withResolvers<void>();
	onSession = session.resolve;
	const pending = assert.rejects(first.shell(), { code: 'SSH_OPERATION_CANCELLED' });
	await session.promise;

	consumer.abort();
	await pending;
	await first.close();
	assert.deepEqual(first.getState(), { state: 'failed', code: 'SSH_OPERATION_CANCELLED' });
	assert.equal(second.getState().state, 'connected');
	await assert.rejects(ssh.connect({ ...options(), signal: consumer.signal }), { code: 'SSH_OPERATION_CANCELLED' });
});

it('discards a host verification answer after the consumer cancels', { timeout: 8000 }, async () => {
	const consumer = new AbortController();
	const verifying = Promise.withResolvers<(accepted: boolean) => void>();
	const pending = assert.rejects(
		ssh.connect({
			...options(),
			signal: consumer.signal,

			hostVerifier: (_fingerprint: string, answer: (value: boolean) => void) => {
				verifying.resolve(answer);
			},
		}),
		{ code: 'SSH_OPERATION_CANCELLED' },
	);
	const answer = await verifying.promise;
	consumer.abort();
	await pending;
	answer(true);
});

it('observes remote disconnect and preserves socket errors as causes', { timeout: 8000 }, async () => {
	const connection = await ssh.connect(options());
	const closed = Promise.withResolvers<void>();
	connection.onStateChange(({ state }) => {
		if (state === 'closed') closed.resolve();
	});
	for (const peer of peers) peer.end();
	await closed.promise;
	await assert.rejects(connection.shell(), { code: 'SSH_CONNECTION_CLOSED' });

	const listener = createServer();
	await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
	const unusedPort = (listener.address() as AddressInfo).port;
	await new Promise<void>((resolve) => listener.close(() => resolve()));
	await assert.rejects(ssh.connect({ ...options(), port: unusedPort }), (error: Error & { code: string }) => {
		assert.equal(error.code, 'SSH_CONNECTION_FAILED');
		assert.equal((error.cause as NodeJS.ErrnoException).code, 'ECONNREFUSED');
		assert.doesNotMatch(JSON.stringify(error), /127\.0\.0\.1/u);
		return true;
	});
});

it('parses a private key and rejects public keys and invalid passphrases', () => {
	const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const publicKey = keys.publicKey.export({ type: 'pkcs1', format: 'pem' });
	const privateKey = keys.privateKey.export({
		type: 'pkcs1',
		format: 'pem',
		cipher: 'aes-256-cbc',
		passphrase: 'secret',
	});
	assert.ok(ssh.parsePrivateKey(privateKey, 'secret').isPrivateKey());
	assert.throws(() => ssh.parsePrivateKey(privateKey, 'wrong'), { code: 'SSH_PRIVATE_KEY_INVALID' });
	const parsed = ssh2.utils.parseKey(publicKey);
	assert.ok(parsed instanceof Error || !parsed.isPrivateKey());
	const openssh = ssh.parsePrivateKey(privateKey, 'secret');
	const publicSsh = openssh.type + ' ' + openssh.getPublicSSH().toString('base64');
	assert.throws(() => ssh.parsePrivateKey(publicSsh), { code: 'SSH_PRIVATE_KEY_REQUIRED' });
});
