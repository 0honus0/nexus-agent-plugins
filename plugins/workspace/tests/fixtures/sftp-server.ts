import type { Stats } from 'node:fs';

const attributes = (stat: Stats) => ({
	mode: stat.mode,
	uid: stat.uid,
	gid: stat.gid,
	size: stat.size,
	atime: Math.floor(stat.atimeMs / 1000),
	mtime: Math.floor(stat.mtimeMs / 1000),
});

import type { Session } from 'ssh2';
import { posix, resolve, sep } from 'node:path';
import * as fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

/** A real SSH2 SFTP subsystem backed by an isolated temporary directory. Test-only protocol adapter. */
export function mountTestSftp(session: Session, root: string, beforeRead?: (path: string) => Promise<void>) {
	session.on('sftp', (accept) => {
		const stream = accept();
		const handles = new Map<string, { file?: FileHandle; path?: string; directory?: string; read?: boolean }>();
		let next = 0;

		const local = (path: string) => {
			const resolved = resolve(root, '.' + posix.resolve('/', path));
			if (resolved !== root && !resolved.startsWith(root + sep)) throw Error('outside fixture');
			return resolved;
		};

		const fail = (id: number, error: unknown) => {
			const code = (error as NodeJS.ErrnoException).code;
			stream.status(id, code === 'ENOENT' ? 2 : code === 'EACCES' ? 3 : 4);
		};

		const handle = (value: { file?: FileHandle; path?: string; directory?: string }) => {
			const id = String(++next);
			handles.set(id, value);
			return Buffer.from(id);
		};

		stream.on('REALPATH', (id, path) => {
			stream.name(id, [
				{
					filename: posix.resolve('/', path),
					longname: '',
					attrs: { mode: 0o40755, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 },
				},
			]);
		});
		for (const event of ['STAT', 'LSTAT'] as const)
			stream.on(event, (id: number, path: string) => {
				void fs[event === 'STAT' ? 'stat' : 'lstat'](local(path)).then(
					(stat) => stream.attrs(id, attributes(stat)),
					(e) => fail(id, e),
				);
			});
		stream.on('OPENDIR', (id, path) => {
			void fs.readdir(local(path)).then(
				() => stream.handle(id, handle({ directory: local(path) })),
				(e) => fail(id, e),
			);
		});
		stream.on('READDIR', (id, value) => {
			const item = handles.get(value.toString());
			if (!item?.directory) {
				stream.status(id, 4);
				return;
			}
			if (item.read) {
				stream.status(id, 1);
				return;
			}
			item.read = true;
			void fs
				.readdir(item.directory)
				.then(async (names) => {
					const entries = await Promise.all(
						names.map(async (name) => ({
							filename: name,
							longname: name,
							attrs: attributes(await fs.lstat(resolve(item.directory!, name))),
						})),
					);
					if (entries.length) stream.name(id, entries);
					else stream.status(id, 1);
				})
				.catch((e) => fail(id, e));
		});
		stream.on('OPEN', (id, path, flags, attrs) => {
			// SFTP v3 flags: READ=1, WRITE=2, APPEND=4, CREAT=8, TRUNC=16, EXCL=32.
			const mode = flags & 2 ? (flags & 32 ? 'wx' : flags & 4 ? 'a' : 'w') : 'r';
			void fs.open(local(path), mode, attrs.mode).then(
				(file) => stream.handle(id, handle({ file, path })),
				(e) => fail(id, e),
			);
		});
		stream.on('READ', (id, value, offset, length) => {
			const item = handles.get(value.toString());
			const file = item?.file;
			if (!file) {
				stream.status(id, 4);
				return;
			}
			const buffer = Buffer.alloc(Math.min(length, 32768));
			void (async () => {
				if (item.path) await beforeRead?.(item.path);
				return file.read(buffer, 0, buffer.length, offset);
			})().then(
				({ bytesRead }) => {
					if (!bytesRead) stream.status(id, 1);
					else stream.data(id, buffer.subarray(0, bytesRead));
				},
				(e) => fail(id, e),
			);
		});
		stream.on('WRITE', (id, value, offset, data) => {
			const file = handles.get(value.toString())?.file;
			if (!file) {
				stream.status(id, 4);
				return;
			}
			void file.write(data, 0, data.length, offset).then(
				() => stream.status(id, 0),
				(e) => fail(id, e),
			);
		});
		stream.on('FSTAT', (id, value) => {
			const file = handles.get(value.toString())?.file;
			if (!file) {
				stream.status(id, 4);
				return;
			}
			void file.stat().then(
				(stat) => stream.attrs(id, attributes(stat)),
				(e) => fail(id, e),
			);
		});
		stream.on('CLOSE', (id, value) => {
			const item = handles.get(value.toString());
			handles.delete(value.toString());
			void (item?.file?.close() ?? Promise.resolve()).then(
				() => stream.status(id, 0),
				(e) => fail(id, e),
			);
		});
		for (const [event, action] of [
			['MKDIR', fs.mkdir],
			['RMDIR', fs.rmdir],
			['REMOVE', fs.unlink],
		] as const) {
			stream.on(event, (id: number, path: string) => {
				void action(local(path)).then(
					() => stream.status(id, 0),
					(e) => fail(id, e),
				);
			});
		}
		stream.on('SETSTAT', (id, path, attrs) => {
			void (async () => {
				if (attrs.mode !== undefined) await fs.chmod(local(path), attrs.mode);
				if (attrs.atime !== undefined && attrs.mtime !== undefined)
					await fs.utimes(local(path), attrs.atime, attrs.mtime);
			})().then(
				() => stream.status(id, 0),
				(cause) => fail(id, cause),
			);
		});
		stream.on('READLINK', (id, path) => {
			void fs.readlink(local(path)).then(
				(target) =>
					stream.name(id, [
						{
							filename: target,
							longname: '',
							attrs: { mode: 0, uid: 0, gid: 0, size: 0, atime: 0, mtime: 0 },
						},
					]),
				(cause) => fail(id, cause),
			);
		});
		stream.on('SYMLINK', (id, target, path) => {
			void fs.symlink(target, local(path)).then(
				() => stream.status(id, 0),
				(cause) => fail(id, cause),
			);
		});
		stream.on('RENAME', (id, from, to) => {
			void fs
				.lstat(local(to))
				.then(
					() => stream.status(id, 4),
					async (e) => {
						if (e.code !== 'ENOENT') throw e;
						await fs.rename(local(from), local(to));
						stream.status(id, 0);
					},
				)
				.catch((e) => fail(id, e));
		});
		stream.on('error', () => {});
		stream.once('close', () => {
			for (const item of handles.values()) void item.file?.close().catch(() => {});
			handles.clear();
		});
	});
}
