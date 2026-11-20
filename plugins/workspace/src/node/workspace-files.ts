import { posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { writeSftpFile, downloadSftpFile } from './workspace-sftp-streams';
import type { TransferProgress } from './workspace-transfers';
import type { Readable, Writable } from 'node:stream';
import type { SFTPWrapper } from 'ssh2';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type { RemoteDirectory } from '../shared/workspace-file-types';
import type { FileMutation } from '../shared/workspace-file-http-types';
import { searchRemoteFiles } from './workspace-file-search';
import { WorkspaceError } from './workspace-error';
import { transferWorkspaceFiles, removeWorkspaceTree } from './workspace-file-transfer';
import type { FileTransfer } from '../shared/workspace-file-operation-types';

/** One lazily opened SFTP channel per SSH session. File streams have independent cancellation. */
export function createWorkspaceFiles(connection: SshConnectionApi, onTransfers: (count: number) => void = () => {}) {
	let channel: Promise<SFTPWrapper> | undefined;
	let disposed = false;
	let transfers = new AbortController();
	const pending = new Set<Promise<unknown>>();

	async function client() {
		if (disposed) throw new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 404);
		channel ??= connection
			.sftp()
			.then((sftp) => {
				if (disposed) {
					sftp.end();
					throw new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 404);
				}
				sftp.once('close', () => {
					channel = undefined;
				});
				return sftp;
			})
			.catch((error) => {
				channel = undefined;
				throw error;
			});
		return channel;
	}

	async function absent(sftp: SFTPWrapper, path: string) {
		try {
			await promisify(sftp.lstat.bind(sftp))(path);
		} catch (error) {
			if ((error as { code?: number }).code === 2) return;
			throw error;
		}
		throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
	}

	async function transfer<T>(signal: AbortSignal, action: (sftp: SFTPWrapper, signal: AbortSignal) => Promise<T>) {
		const combined = AbortSignal.any([signal, transfers.signal]);
		const task = (async () => {
			combined.throwIfAborted();
			const sftp = await client();
			combined.throwIfAborted();
			return action(sftp, combined);
		})();
		pending.add(task);
		onTransfers(pending.size);
		try {
			return await task;
		} finally {
			pending.delete(task);
			onTransfers(pending.size);
		}
	}

	async function cancelTransfers() {
		transfers.abort();
		await Promise.allSettled([...pending]);
		if (!disposed) transfers = new AbortController();
	}

	return {
		/** Internal session-to-session adapter; the browser never receives raw SFTP capabilities. */
		withTransfer: transfer,

		transferTo(
			target: { withTransfer: typeof transfer },
			input: FileTransfer,
			signal: AbortSignal,
			sameServer = false,
			progress?: TransferProgress,
			native?: Parameters<typeof transferWorkspaceFiles>[4]['native'],
		) {
			return transfer(signal, (source, signal) =>
				target.withTransfer(signal, (destination, signal) =>
					transferWorkspaceFiles(source, destination, input.paths, input.destination, {
						...input,
						sameServer,
						progress,
						native,
						signal,
					}),
				),
			);
		},

		async chmod(paths: string[], mode: number) {
			const sftp = await client();
			for (const path of paths) {
				const attrs = await promisify(sftp.lstat.bind(sftp))(path);
				if (attrs.isSymbolicLink()) throw new WorkspaceError('WORKSPACE_FILE_KIND_UNSUPPORTED');
				await promisify(sftp.chmod.bind(sftp))(path, mode);
			}
		},

		async remove(paths: string[], signal: AbortSignal) {
			const sftp = await client();
			for (const path of paths) {
				signal.throwIfAborted();
				if (posix.resolve(path) === '/') throw new WorkspaceError('WORKSPACE_INVALID_REQUEST');
				await removeWorkspaceTree(sftp, path);
			}
		},

		async list(path: string): Promise<RemoteDirectory> {
			const sftp = await client();
			const canonical = await promisify(sftp.realpath.bind(sftp))(path);
			const entries = await promisify(sftp.readdir.bind(sftp))(canonical);
			return {
				path: canonical,
				entries: entries
					.filter((e) => e.filename !== '.' && e.filename !== '..')
					.map(({ filename, attrs }) => ({
						name: filename,
						path: posix.join(canonical, filename),
						kind: attrs.isDirectory()
							? 'directory'
							: attrs.isSymbolicLink()
								? 'link'
								: attrs.isFile()
									? 'file'
									: 'other',
						size: attrs.size,
						modifiedAt: attrs.mtime * 1000,
						mode: attrs.mode,
					})),
			};
		},

		search(path: string, query: string, signal: AbortSignal) {
			return searchRemoteFiles(this.list, path, query, signal);
		},

		async mutate(input: FileMutation) {
			const sftp = await client();
			if (input.operation === 'mkdir') await promisify(sftp.mkdir.bind(sftp))(input.path);
			else if (input.operation === 'file') {
				const handle = await new Promise<Buffer>((resolve, reject) => {
					sftp.open(input.path, 'wx', 0o600, (error, handle) => (error ? reject(error) : resolve(handle)));
				});
				await promisify(sftp.close.bind(sftp))(handle);
			} else if (input.operation === 'rename') {
				await absent(sftp, input.destination);
				await promisify(sftp.rename.bind(sftp))(input.path, input.destination);
			} else {
				const attrs = await promisify(sftp.lstat.bind(sftp))(input.path);
				if (attrs.isDirectory()) await promisify(sftp.rmdir.bind(sftp))(input.path);
				else await promisify(sftp.unlink.bind(sftp))(input.path);
			}
		},

		async stat(path: string) {
			const sftp = await client();
			const attrs = await promisify(sftp.stat.bind(sftp))(path);
			if (!attrs.isFile()) throw new WorkspaceError('WORKSPACE_NOT_A_FILE', 400);
			return { size: attrs.size };
		},

		upload(
			path: string,
			source: Readable,
			signal: AbortSignal,
			progress?: TransferProgress,
			size?: number,
			overwrite = false,
		) {
			return transfer(signal, async (sftp, signal) => {
				if (!overwrite) await absent(sftp, path);
				const temporary = posix.join(posix.dirname(path), '.nexus-upload-' + randomUUID());
				const backup = temporary + '.previous';
				let previous = false,
					published = false,
					preserve = false;
				try {
					progress?.update({ state: 'transferring', method: 'http', currentFile: posix.basename(path) });
					await writeSftpFile(sftp, temporary, source, {
						signal,
						size,

						progress: (bytes) => progress?.update({ bytes }),
					});
					signal.throwIfAborted();
					progress?.update({ state: 'committing' });
					if (!overwrite) await absent(sftp, path);
					else {
						try {
							const attrs = await promisify(sftp.lstat.bind(sftp))(path);
							if (attrs.isDirectory()) throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
							await promisify(sftp.rename.bind(sftp))(path, backup);
							previous = true;
						} catch (cause) {
							if ((cause as { code?: number }).code !== 2) throw cause;
						}
					}
					try {
						await promisify(sftp.rename.bind(sftp))(temporary, path);
						published = true;
					} catch (cause) {
						if (previous) {
							try {
								await promisify(sftp.rename.bind(sftp))(backup, path);
							} catch {
								preserve = true;
								throw new WorkspaceError('WORKSPACE_TRANSFER_ROLLBACK_FAILED', 409);
							}
						}
						throw cause;
					}
				} finally {
					if (!preserve) await promisify(sftp.unlink.bind(sftp))(temporary).catch(() => {});
					if (previous && published) await promisify(sftp.unlink.bind(sftp))(backup);
				}
			});
		},

		download(
			path: string,
			destination: Writable,
			signal: AbortSignal,
			progress?: TransferProgress,
			range?: { start: number; end: number },
		) {
			return transfer(signal, async (sftp, signal) => {
				progress?.update({ state: 'transferring', method: 'http' });
				await downloadSftpFile(sftp, path, destination, {
					signal,
					...range,

					progress: (bytes) => progress?.update({ bytes }),
				});
			});
		},

		cancelTransfers,

		async dispose() {
			if (disposed) return;
			disposed = true;
			await cancelTransfers();
			const sftp = await channel?.catch(() => undefined);
			sftp?.end();
		},
	};
}
