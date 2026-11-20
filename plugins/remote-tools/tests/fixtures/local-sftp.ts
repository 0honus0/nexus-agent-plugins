import * as fs from 'node:fs';
import type { SFTPWrapper } from 'ssh2';

/** Test-only adapter: real files and streams, with SFTP numeric error codes and second timestamps. */
export function localSftp() {
	const wrap = (callback: Function) => (cause: NodeJS.ErrnoException | null, value?: unknown) =>
		callback(
			cause
				? Object.assign(cause, {
						code: cause.code === 'ENOENT' ? 2 : cause.code === 'EACCES' ? 3 : 4,
					})
				: null,
			value,
		);

	const stat =
		(operation: (path: string, callback: (cause: NodeJS.ErrnoException | null, attrs: fs.Stats) => void) => void) =>
		(path: string, callback: Function) =>
			operation(path, (cause, attrs) =>
				wrap(callback)(
					cause,
					attrs &&
						Object.assign(Object.create(Object.getPrototypeOf(attrs)), attrs, {
							mtime: Math.floor(attrs.mtimeMs / 1000),
							atime: Math.floor(attrs.atimeMs / 1000),
						}),
				),
			);

	const lstat = stat(fs.lstat);
	return {
		open: (path: string, flags: string, attrs: unknown, callback?: Function) => {
			const cb = typeof attrs === 'function' ? attrs : callback!;
			fs.open(path, flags, typeof attrs === 'number' ? attrs : 0o600, (cause, fd) =>
				cb(cause, Buffer.from(String(fd))),
			);
		},

		fstat: (handle: Buffer, callback: Function) =>
			fs.fstat(Number(handle.toString()), (cause, attrs) => callback(cause, attrs)),

		close: (handle: Buffer, callback: Function) => fs.close(Number(handle.toString()), wrap(callback)),

		read: (handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, callback: Function) =>
			fs.read(Number(handle.toString()), buffer, offset, length, position, (cause, bytes) =>
				callback(cause, bytes, buffer, position),
			),

		write: (handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, callback: Function) =>
			fs.write(Number(handle.toString()), buffer, offset, length, position, (cause, bytes) =>
				callback(cause, bytes),
			),

		lstat,
		stat: stat(fs.stat),

		realpath: (path: string, callback: Function) => fs.realpath(path, wrap(callback)),

		readdir: (path: string, callback: Function) =>
			fs.readdir(path, (cause, names) => {
				if (cause) {
					wrap(callback)(cause);
					return;
				}
				Promise.all(
					names.map(
						(filename) =>
							new Promise((resolve, reject) =>
								lstat(path + '/' + filename, (cause: unknown, attrs: unknown) =>
									cause ? reject(cause) : resolve({ filename, attrs }),
								),
							),
					),
				).then(
					(value) => callback(null, value),
					(cause) => callback(cause),
				);
			}),

		mkdir: (path: string, attrs: unknown, callback?: Function) => {
			if (typeof attrs === 'function') fs.mkdir(path, wrap(attrs));
			else fs.mkdir(path, attrs as fs.MakeDirectoryOptions, wrap(callback!));
		},

		chmod: (path: string, mode: number, callback: Function) => fs.chmod(path, mode, wrap(callback)),

		utimes: (path: string, a: number, m: number, callback: Function) => fs.utimes(path, a, m, wrap(callback)),

		readlink: (path: string, callback: Function) => fs.readlink(path, wrap(callback)),

		symlink: (target: string, path: string, callback: Function) => fs.symlink(target, path, wrap(callback)),

		rename: (from: string, to: string, callback: Function) => fs.rename(from, to, wrap(callback)),

		unlink: (path: string, callback: Function) => fs.unlink(path, wrap(callback)),

		rmdir: (path: string, callback: Function) => fs.rmdir(path, wrap(callback)),

		writeFile: (path: string, bytes: Buffer, options: fs.WriteFileOptions, callback: Function) =>
			fs.writeFile(path, bytes, options, wrap(callback)),

		createReadStream: fs.createReadStream,
		createWriteStream: fs.createWriteStream,

		end() {},
	} as unknown as SFTPWrapper;
}
