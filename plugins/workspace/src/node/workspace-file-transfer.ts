import { posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import PQueue from 'p-queue';
import { readSftpFile, writeSftpFile } from './workspace-sftp-streams';
import type { TransferProgress } from './workspace-transfers';
import type { SFTPWrapper } from 'ssh2';
import { WorkspaceError } from './workspace-error';

/** Every transport writes a private stage. Verify before publishing; only confirmed pre-dispatch failures may relay. */
export async function transferWorkspaceFiles(
	source: SFTPWrapper,
	destination: SFTPWrapper,
	paths: string[],
	directory: string,
	options: {
		move: boolean;
		overwrite: boolean;
		signal: AbortSignal;
		sameServer?: boolean;
		progress?: TransferProgress;
		native?: (
			stage: string,
			paths: string[],
			filesOnly: boolean,
			progress: (bytes: number) => void,
		) => Promise<{ state: 'copied'; method: 'rsync' | 'scp' | 'local' } | { state: 'unavailable'; reason: string }>;
	},
) {
	const { signal, overwrite, move, progress } = options;
	// Keep staging paths below their private root; do not reinterpret symlink/.. traversal.
	if (paths.some((path) => !posix.isAbsolute(path) || path.split('/').some((part) => part === '.' || part === '..')))
		throw new WorkspaceError('WORKSPACE_INVALID_REQUEST');
	paths = paths.map((path) => posix.normalize(path));
	progress?.update({ state: 'preparing' });
	const root = await promisify(destination.realpath.bind(destination))(directory);
	const rootAttributes = await promisify(destination.lstat.bind(destination))(root);
	if (!rootAttributes.isDirectory()) throw new WorkspaceError('WORKSPACE_NOT_A_DIRECTORY');
	if (paths.some((p) => posix.resolve(p) === '/')) throw new WorkspaceError('WORKSPACE_INVALID_REQUEST');
	const selected = [...new Set(paths)].filter(
		(p) => !paths.some((parent) => parent !== p && p.startsWith(parent + '/')),
	);
	if (new Set(selected.map((p) => posix.basename(p))).size !== selected.length)
		throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
	if (
		(source === destination || options.sameServer) &&
		selected.some((p) => root === p || root.startsWith(p + '/') || posix.join(root, posix.basename(p)) === p)
	)
		throw new WorkspaceError('WORKSPACE_TRANSFER_SAME_PATH', 409);
	const plan: { from: string; relative: string; attrs: Awaited<ReturnType<typeof stat>> }[] = [];

	const scanning = new PQueue({ concurrency: 8 });
	let scanFailure: unknown;

	const schedule = (from: string, relative: string) => {
		void scanning
			.add(() => scan(from, relative))
			.catch((cause) => {
				scanFailure ??= cause;
			});
	};

	async function scan(from: string, relative: string) {
		if (scanFailure) return;
		signal.throwIfAborted();
		if (plan.length >= 100000) throw new WorkspaceError('WORKSPACE_TRANSFER_LIMIT', 409);
		const attrs = await stat(source, from);
		if (!attrs.isDirectory() && !attrs.isFile() && !attrs.isSymbolicLink())
			throw new WorkspaceError('WORKSPACE_FILE_KIND_UNSUPPORTED');
		const previous = await optionalStat(destination, posix.join(root, relative));
		if (
			previous &&
			!(attrs.isDirectory() && previous.isDirectory()) &&
			(!overwrite || attrs.isDirectory() || previous.isDirectory())
		)
			throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
		plan.push({ from, relative, attrs });
		if (attrs.isDirectory())
			for (const e of await promisify(source.readdir.bind(source))(from))
				if (e.filename !== '.' && e.filename !== '..')
					schedule(posix.join(from, e.filename), posix.join(relative, e.filename));
	}

	for (const path of selected) schedule(path, posix.basename(path));
	await scanning.onIdle();
	if (scanFailure) throw scanFailure;
	let preserveStage = false;
	const createdDirectories: { path: string; mode: number }[] = [];
	const stage = posix.join(root, '.nexus-copy-' + randomUUID());
	await mkdir(destination, stage);
	try {
		const totalBytes = plan.reduce((sum, item) => sum + (item.attrs.isFile() ? item.attrs.size : 0), 0);
		progress?.update({
			totalBytes,
			totalItems: plan.length,
			state: options.native ? 'connecting' : 'transferring',
			method: options.native ? undefined : 'sftp',
		});
		const native = await options.native?.(
			stage,
			selected,
			plan.every((item) => item.attrs.isFile()),
			(bytes) => progress?.update({ state: 'transferring', bytes: Math.min(bytes, totalBytes) }),
		);
		if (native?.state === 'copied')
			progress?.update({ state: 'transferring', method: native.method, bytes: totalBytes });
		else {
			progress?.update({ state: 'transferring', method: 'sftp', fallback: !!native });
			for (const item of plan)
				if (item.attrs.isDirectory()) await mkdir(destination, posix.join(stage, item.relative));
			const queue = new PQueue({ concurrency: 3 });
			let bytes = 0,
				completed = 0,
				failure: unknown;
			const work = plan
				.filter((item) => !item.attrs.isDirectory())
				.map((item) =>
					queue
						.add(async () => {
							if (failure) return;
							signal.throwIfAborted();
							const target = posix.join(stage, item.relative);
							progress?.update({ currentFile: item.relative });
							if (item.attrs.isSymbolicLink())
								await promisify(destination.symlink.bind(destination))(
									await promisify(source.readlink.bind(source))(item.from),
									target,
								);
							else {
								let previous = 0;
								await writeSftpFile(destination, target, readSftpFile(source, item.from, { signal }), {
									signal,
									mode: item.attrs.mode & 0o777,
									size: item.attrs.size,

									progress(confirmed) {
										bytes += confirmed - previous;
										previous = confirmed;
										progress?.update({ bytes });
									},
								});
							}
							progress?.update({ completedItems: ++completed });
						})
						.catch((cause) => {
							failure ??= cause;
						}),
				);
			await Promise.all(work);
			if (failure) throw failure;
		}
		// Native tools and relay share the same verification/publication semantics.
		for (const item of plan) {
			signal.throwIfAborted();
			const target = posix.join(stage, item.relative);
			const after = await stat(source, item.from),
				copied = await stat(destination, target);
			if (
				after.size !== item.attrs.size ||
				after.mtime !== item.attrs.mtime ||
				copied.isDirectory() !== item.attrs.isDirectory() ||
				copied.isSymbolicLink() !== item.attrs.isSymbolicLink() ||
				(item.attrs.isFile() && copied.size !== item.attrs.size)
			)
				throw new WorkspaceError('WORKSPACE_TRANSFER_SOURCE_CHANGED', 409);
			if (item.attrs.isFile()) {
				await promisify(destination.chmod.bind(destination))(target, item.attrs.mode & 0o777);
				await promisify(destination.utimes.bind(destination))(target, item.attrs.atime, item.attrs.mtime);
			}
		}
		progress?.update({ state: 'committing', bytes: totalBytes, completedItems: plan.length });

		// Publish only after every source has been completely staged.
		for (const item of plan) {
			signal.throwIfAborted();
			const target = posix.join(root, item.relative);
			const previous = await optionalStat(destination, target);
			if (item.attrs.isDirectory()) {
				if (previous && !previous.isDirectory()) throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
				if (!previous) {
					await mkdir(destination, target);
					createdDirectories.push({ path: target, mode: item.attrs.mode & 0o777 });
				}
				continue;
			}
			if (previous && (!overwrite || previous.isDirectory()))
				throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
			const backup = posix.join(stage, '.replace-' + randomUUID());
			if (previous) await promisify(destination.rename.bind(destination))(target, backup);
			try {
				await promisify(destination.rename.bind(destination))(posix.join(stage, item.relative), target);
			} catch (cause) {
				if (previous) {
					try {
						await promisify(destination.rename.bind(destination))(backup, target);
					} catch {
						preserveStage = true;
						throw new WorkspaceError('WORKSPACE_TRANSFER_ROLLBACK_FAILED', 409);
					}
				}
				throw cause;
			}
			if (previous) await promisify(destination.unlink.bind(destination))(backup);
		}
		for (const item of createdDirectories.reverse())
			await promisify(destination.chmod.bind(destination))(item.path, item.mode);
		if (move) {
			// Verify again before deleting any source. Changed sources are retained.
			for (const item of plan) {
				signal.throwIfAborted();
				const now = await stat(source, item.from);
				if (
					now.isDirectory() !== item.attrs.isDirectory() ||
					now.isSymbolicLink() !== item.attrs.isSymbolicLink() ||
					(!now.isDirectory() && (now.size !== item.attrs.size || now.mtime !== item.attrs.mtime))
				)
					throw new WorkspaceError('WORKSPACE_TRANSFER_SOURCE_CHANGED', 409);
			}
			for (const item of [...plan].reverse()) {
				signal.throwIfAborted();
				if (item.attrs.isDirectory()) await promisify(source.rmdir.bind(source))(item.from);
				else await promisify(source.unlink.bind(source))(item.from);
			}
		}
	} catch (cause) {
		if (
			['REMOTE_TOOLS_TRANSFER_UNKNOWN', 'REMOTE_TOOLS_TRANSFER_CLEANUP'].includes(
				String((cause as { code?: string }).code),
			)
		)
			preserveStage = true;
		throw cause;
	} finally {
		if (!preserveStage) await removeWorkspaceTree(destination, stage).catch(() => {});
	}
}

async function stat(sftp: SFTPWrapper, path: string) {
	return promisify(sftp.lstat.bind(sftp))(path);
}

async function optionalStat(sftp: SFTPWrapper, path: string) {
	try {
		return await stat(sftp, path);
	} catch (cause) {
		if ((cause as { code?: number }).code === 2) return;
		throw cause;
	}
}

export async function removeWorkspaceTree(sftp: SFTPWrapper, path: string): Promise<void> {
	const attrs = await optionalStat(sftp, path);
	if (!attrs) return;
	if (attrs.isDirectory()) {
		for (const e of await promisify(sftp.readdir.bind(sftp))(path))
			if (e.filename !== '.' && e.filename !== '..')
				await removeWorkspaceTree(sftp, posix.join(path, e.filename));
		await promisify(sftp.rmdir.bind(sftp))(path);
	} else await promisify(sftp.unlink.bind(sftp))(path);
}

function mkdir(sftp: SFTPWrapper, path: string) {
	return new Promise<void>((resolve, reject) =>
		sftp.mkdir(path, { mode: 0o700 }, (cause) => (cause ? reject(cause) : resolve())),
	);
}
