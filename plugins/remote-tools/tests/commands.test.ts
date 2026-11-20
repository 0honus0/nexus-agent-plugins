import { afterEach, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { parse } from 'shell-quote';
import type { ClientChannel } from 'ssh2';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import { RemoteTools } from '../src/node/remote-tools-api.js';
import { testScope } from './fixtures/scope.js';
afterEach(() => vi.useRealTimers());

function channel() {
	return Object.assign(new PassThrough(), {
		stderr: new PassThrough(),
	}) as unknown as ClientChannel;
}

function fixture(exec: SshConnectionApi['exec']) {
	const close = vi.fn();
	const provider = testScope();
	const owner = testScope();
	const unsubscribe = vi.fn();
	const connection = {
		exec,
		close,

		getState: () => ({ state: 'connected' }),

		onStateChange: () => unsubscribe,
	} as unknown as SshConnectionApi;
	const session = new RemoteTools(provider).bind(connection, owner);
	return { session, owner, provider, close, unsubscribe };
}

it('quotes argv literally, collects both outputs and preserves nonzero exit codes', async () => {
	const stream = channel();
	const exec = vi.fn(async (_command: string) => stream);
	const f = fixture(exec);
	const args = ['a b', '$(touch /tmp/not-executed)', "quote'", '; echo hidden'];
	const pending = f.session.execute({ executable: 'printf', args });
	await Promise.resolve();
	await Promise.resolve();
	expect(parse(exec.mock.calls[0]![0])).toEqual(['printf', ...args]);
	stream.emit('data', Buffer.from('out'));
	stream.stderr.emit('data', Buffer.from('private stderr'));
	stream.emit('exit', 7);
	stream.emit('close');
	expect(await pending).toMatchObject({ stdout: 'out', stderr: 'private stderr', code: 7 });
	await f.session.close();
	expect(f.close).not.toHaveBeenCalled();
	await expect(f.session.execute({ executable: 'true' })).rejects.toMatchObject({
		code: 'REMOTE_TOOLS_EXEC_DISPOSED',
	});
});
it('caps combined stdout/stderr without retrying', async () => {
	const stream = channel();
	const exec = vi.fn(async (_command: string) => stream);
	const f = fixture(exec);
	const pending = f.session.execute({ executable: 'cmd', maxOutputBytes: 4 });
	const result = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TOOLS_EXEC_OUTPUT_LIMIT' });
	await Promise.resolve();
	await Promise.resolve();
	stream.emit('data', Buffer.from('abc'));
	stream.stderr.emit('data', Buffer.from('de'));
	await result;
	expect(stream.destroyed).toBe(true);
	expect(exec).toHaveBeenCalledOnce();
	await f.provider.stop();
});
it('cancels indefinite commands with their binding without closing SSH', async () => {
	const stream = channel();
	const f = fixture(async () => stream);
	const pending = f.session.execute({ executable: 'tail', timeoutMs: null });
	const result = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TOOLS_EXEC_CANCELED' });
	await Promise.resolve();
	await Promise.resolve();
	await f.owner.stop();
	await result;
	expect(stream.destroyed).toBe(true);
	expect(f.close).not.toHaveBeenCalled();
});
it('destroys channels acquired after timeout', async () => {
	vi.useFakeTimers();
	let resolve!: (channel: ClientChannel) => void;
	const f = fixture(
		() =>
			new Promise((done) => {
				resolve = done;
			}),
	);
	const pending = f.session.execute({ executable: 'true', timeoutMs: 10 });
	const result = expect(pending).rejects.toMatchObject({ code: 'REMOTE_TOOLS_EXEC_TIMEOUT' });
	await vi.advanceTimersByTimeAsync(11);
	await result;
	const stream = channel();
	resolve(stream);
	await vi.advanceTimersByTimeAsync(0);
	expect(stream.destroyed).toBe(true);
	await f.provider.stop();
	expect(vi.getTimerCount()).toBe(0);
});
it('detects missing commands without executing installers', async () => {
	const stream = channel();
	const exec = vi.fn(async (_command: string) => stream);
	const f = fixture(exec);
	const pending = f.session.inspect(['tar', 'rsync']);
	await Promise.resolve();
	await Promise.resolve();
	stream.emit('data', Buffer.from('Linux\n1\n0\n'));
	stream.emit('exit', 0);
	stream.emit('close');
	expect(await pending).toEqual({
		kernel: 'Linux',
		platform: 'linux',
		tools: [
			{ name: 'tar', available: true },
			{ name: 'rsync', available: false },
		],
	});
	expect(exec).toHaveBeenCalledOnce();
	await expect(f.session.inspect(['tar;whoami'])).rejects.toThrow();
	await f.provider.stop();
});

it('closes late channels after an owner is stopped without closing SSH', async () => {
	const opening = Promise.withResolvers<ClientChannel>();
	const f = fixture(() => opening.promise);
	const operation = f.session.execute({ executable: 'true', timeoutMs: null });
	const canceled = expect(operation).rejects.toMatchObject({ code: 'REMOTE_TOOLS_EXEC_CANCELED' });
	await f.owner.stop();
	await canceled;

	const stream = channel();
	opening.resolve(stream);
	await opening.promise;
	expect(stream.destroyed).toBe(true);
	expect(f.unsubscribe).toHaveBeenCalledOnce();
	expect(f.close).not.toHaveBeenCalled();
});

it('reads the exit status from close when exit has already occurred', async () => {
	const stream = channel();
	const f = fixture(async () => stream);
	const operation = f.session.execute({ executable: 'true' });
	await Promise.resolve();
	stream.emit('close', 0);
	expect(await operation).toMatchObject({ code: 0 });
	await f.provider.stop();
});
