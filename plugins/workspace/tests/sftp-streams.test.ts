import { Readable } from 'node:stream';
import type { SFTPWrapper } from 'ssh2';
import { expect, it, vi } from 'vitest';
import { writeSftpFile } from '../src/node/workspace-sftp-streams';

it('cancels an idle upload when its file was opened after cancellation', async () => {
	const controller = new AbortController();
	let completeOpen!: (cause: Error | null, handle: Buffer) => void;
	const close = vi.fn((_handle, done) => done());
	const sftp = {
		open: (_path: string, _flags: string, _mode: number, done: typeof completeOpen) => {
			completeOpen = done;
		},

		close,
	} as unknown as SFTPWrapper;
	const source = new Readable({ read() {} });
	let settled = false;
	const task = writeSftpFile(sftp, '/file', source, { signal: controller.signal }).finally(() => {
		settled = true;
	});
	const failed = expect(task).rejects.toBeDefined();
	try {
		controller.abort();
		completeOpen(null, Buffer.from('handle'));
		await vi.waitFor(() => expect(settled).toBe(true));
		await failed;
		expect(close).toHaveBeenCalledOnce();
		expect(source.destroyed).toBe(true);
	} finally {
		source.destroy();
		await failed;
	}
});

it('stops waiting for input after a remote write fails and preserves the underlying error', async () => {
	const failure = Object.assign(new Error('permission denied'), { code: 3 });
	const close = vi.fn((_handle, done) => done());
	const sftp = {
		open: (_path: string, _flags: string, _mode: number, done: (cause: Error | null, handle: Buffer) => void) =>
			done(null, Buffer.from('handle')),

		write: (
			_handle: Buffer,
			_bytes: Buffer,
			_offset: number,
			_length: number,
			_position: number,
			done: (cause: Error) => void,
		) => done(failure),

		close,
	} as unknown as SFTPWrapper;
	const source = new Readable({ read() {} });
	source.push(Buffer.from('upload'));
	let settled = false;
	const task = writeSftpFile(sftp, '/file', source, { signal: new AbortController().signal }).finally(() => {
		settled = true;
	});
	const failed = expect(task).rejects.toBe(failure);
	try {
		await vi.waitFor(() => expect(settled).toBe(true));
		await failed;
		expect(close).toHaveBeenCalledOnce();
		expect(source.destroyed).toBe(true);
	} finally {
		source.destroy(failure);
		await failed;
	}
});

it('waits for dispatched writes before closing the remote handle after failure', async () => {
	const failure = new Error('write failed');
	const writes: ((cause?: Error) => void)[] = [];
	const close = vi.fn((_handle, done) => done());
	const sftp = {
		open: (_path: string, _flags: string, _mode: number, done: (cause: Error | null, handle: Buffer) => void) =>
			done(null, Buffer.from('handle')),

		write: (
			_handle: Buffer,
			_bytes: Buffer,
			_offset: number,
			_length: number,
			_position: number,
			done: (cause?: Error) => void,
		) => {
			writes.push(done);
		},

		close,
	} as unknown as SFTPWrapper;
	const source = Readable.from([Buffer.alloc(128 * 1024)]);
	const failed = expect(writeSftpFile(sftp, '/file', source, { signal: new AbortController().signal })).rejects.toBe(
		failure,
	);
	try {
		await vi.waitFor(() => expect(writes).toHaveLength(2));
		writes[0]!(failure);
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(close).not.toHaveBeenCalled();
	} finally {
		for (const done of writes) done();
		await failed;
	}
	expect(close).toHaveBeenCalledOnce();
});
