import { posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import type { SFTPWrapper } from 'ssh2';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type { RemoteArchiveApi } from './remote-tools-api.js';
import { ArchiveInputSchema, ExtractInputSchema } from '../shared/remote-file-types.js';
import { NativeArchiveCommands } from './archive-commands.js';
import { NativeArchiveFailure } from './archive-command-error.js';
import type { NativeArchiveOperationOutcome } from './archive-command-types.js';
import { validateListing, resolveLinkTargets, resolveHardlinkTargets } from './archive-rules.js';
import type { RemoteCommandExecutor } from './remote-command.js';
import { RemoteToolsError } from './remote-tools-error.js';
import { openRemoteSftp } from './remote-sftp.js';

/** Native tools work on private snapshots/staging directories; SFTP publishes verified results.
 * An unconfirmed remote exit retains its private paths rather than deleting under a live writer.
 */
export class RemoteArchives implements RemoteArchiveApi {
	constructor(
		private readonly connection: Pick<SshConnectionApi, 'sftp'>,
		private readonly commands: Pick<RemoteCommandExecutor, 'script'>,
		private readonly lifetime: AbortSignal,
	) {}

	async #run<T>(
		signal: AbortSignal | undefined,
		action: (sftp: SFTPWrapper, native: NativeArchiveCommands, signal: AbortSignal) => Promise<T>,
	) {
		const combined = signal ? AbortSignal.any([signal, this.lifetime]) : this.lifetime;
		combined.throwIfAborted();
		const sftp = await openRemoteSftp(this.connection, combined);
		const commands = this.commands;
		try {
			combined.throwIfAborted();
			const native = new NativeArchiveCommands({
				async executeLines(command, signal, timeoutMs, onLine, beforeWriteMarker) {
					const result = await commands.script(command, signal, {
						timeoutMs,
						maxOutputBytes: 16 * 1024 * 1024,
					});
					if (result.code === null) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_OUTCOME_UNKNOWN');
					for (const line of result.stdout.split(/\r?\n/u)) {
						if (line && line !== beforeWriteMarker) onLine(line);
					}
					return result.code === 0 ? { status: 'completed' } : { status: 'nonzero', exitCode: result.code };
				},
			});
			return await action(sftp, native, combined);
		} catch (cause) {
			if (cause instanceof NativeArchiveFailure) {
				throw new RemoteToolsError(
					cause.reason === 'missing_tool'
						? 'REMOTE_TOOLS_ARCHIVE_TOOL_MISSING'
						: 'REMOTE_TOOLS_ARCHIVE_FAILED',
					{ cause },
				);
			}
			throw cause;
		} finally {
			sftp.end();
		}
	}

	#check(outcome: NativeArchiveOperationOutcome) {
		if (outcome.status === 'completed') return;
		throw new RemoteToolsError(
			outcome.reason === 'missing_tool'
				? 'REMOTE_TOOLS_ARCHIVE_TOOL_MISSING'
				: outcome.reason === 'password_required'
					? 'REMOTE_TOOLS_ARCHIVE_PASSWORD_REQUIRED'
					: outcome.reason === 'invalid_password'
						? 'REMOTE_TOOLS_ARCHIVE_PASSWORD_INVALID'
						: 'REMOTE_TOOLS_ARCHIVE_FAILED',
		);
	}

	async compress(...[input, options]: Parameters<RemoteArchiveApi['compress']>): Promise<void> {
		const value = ArchiveInputSchema.parse(input);
		await this.#run(options?.signal, async (sftp, native, signal) => {
			const directory = await promisify(sftp.realpath.bind(sftp))(posix.dirname(value.destination));
			const destination = posix.join(directory, posix.basename(value.destination));
			if (!value.overwrite && (await lstat(sftp, destination)))
				throw new RemoteToolsError('REMOTE_TOOLS_FILE_EXISTS');
			const paths = value.paths;
			// Selection always belongs to one browser directory. No glob/pattern interpretation.
			const cwd = posix.dirname(paths[0]);
			if (paths.some((p) => posix.dirname(p) !== cwd || p === destination || destination.startsWith(p + '/')))
				throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
			if (value.format !== 'zip' && value.password !== undefined)
				throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
			await native.requireTools(
				value.format === 'zip' ? ['zip'] : ['tar', value.format === 'tar.gz' ? 'gzip' : 'bzip2'],
				() => 300000,
				signal,
			);
			const temporary = posix.join(directory, '.nexus-archive-' + randomUUID() + '.' + value.format);
			let confirmed = false;
			try {
				const result = await native.compress(
					cwd,
					paths,
					temporary,
					[posix.relative(cwd, temporary), posix.relative(cwd, destination)],
					value.format,
					() => 3600000,
					signal,
					() => {},
					value.password,
				);
				confirmed = result.writerExited;
				this.#check(result.outcome);
				if (!result.finished || !confirmed) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_OUTCOME_UNKNOWN');
				if (!value.overwrite && (await lstat(sftp, destination)))
					throw new RemoteToolsError('REMOTE_TOOLS_FILE_EXISTS');
				signal.throwIfAborted();
				await publishFile(sftp, temporary, destination, value.overwrite);
			} finally {
				if (confirmed) await removeTree(sftp, temporary);
			}
		});
	}

	async extract(...[input, options]: Parameters<RemoteArchiveApi['extract']>): Promise<void> {
		const value = ExtractInputSchema.parse(input);
		await this.#run(options?.signal, async (sftp, native, signal) => {
			const root = await promisify(sftp.realpath.bind(sftp))(value.destination);
			const suffix = randomUUID();
			const snapshot = posix.join(root, '.nexus-source-' + suffix + '.' + value.format);
			const stage = posix.join(root, '.nexus-extract-' + suffix);
			let confirmed = false;
			try {
				await native.requireTools(
					value.format === 'zip'
						? ['cp', 'unzip', 'zipinfo', 'od']
						: ['cp', 'tar', 'od', value.format === 'tar.gz' ? 'gzip' : 'bzip2'],
					() => 300000,
					signal,
				);
				const copied = await native.copySnapshot(value.archive, snapshot, () => 3600000, signal);
				confirmed = true;
				this.#check(copied);
				const listing = await native.list(snapshot, value.format, () => 3600000, signal);
				const members = validateListing(listing.names, listing.modes, value.format, value.archive);
				if (members.size > 100000 || [...members.values()].reduce((n, m) => n + m.size, 0) > 16 * 1024 ** 3)
					throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
				for (const member of members.values())
					if (member.kind === 'symlink' && value.format === 'zip')
						member.linkTarget = await native.readZipLinkTarget(
							snapshot,
							member.rawName,
							() => 300000,
							signal,
							value.password,
						);
				resolveLinkTargets(members);
				const hardlinks = resolveHardlinkTargets(members);
				// Validate every output ancestor before a single user-visible write.
				for (const [name, member] of members) {
					const parts = name.split('/');
					for (let i = 1; i < parts.length; i++) {
						const found = await lstat(sftp, posix.join(root, ...parts.slice(0, i)));
						if (found && !found.isDirectory()) throw new RemoteToolsError('REMOTE_TOOLS_FILE_EXISTS');
					}
					const found = await lstat(sftp, posix.join(root, name));
					if (
						found &&
						!(found.isDirectory() && member.kind === 'directory') &&
						(!value.overwrite || found.isDirectory() || member.kind === 'directory')
					)
						throw new RemoteToolsError('REMOTE_TOOLS_FILE_EXISTS');
				}
				confirmed = false;
				const result = await native.extract(
					{
						snapshot,
						stage,
						format: value.format,
						excludedMembers: [
							'./',
							...[...members.values()]
								.filter((m) => m.kind === 'symlink' || m.hardlink)
								.map((m) => m.rawName),
						],
						hasContent: [...members.values()].some((m) => m.kind !== 'symlink' && !m.hardlink),
					},
					() => 3600000,
					signal,
					() => {},
					value.password,
				);
				confirmed = true;
				this.#check(result.outcome);
				if (!result.done) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_OUTCOME_UNKNOWN');
				const directories = new Set<string>();
				const directoryModes = new Map<string, number>();
				for (const [name, member] of members) {
					const parts = name.split('/');
					for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join('/'));
					if (member.kind === 'directory') directories.add(name);
				}
				for (const name of [...directories].sort((a, b) => a.split('/').length - b.split('/').length)) {
					const source = posix.join(stage, name);
					const attrs = await lstat(sftp, source);
					if (attrs && !attrs.isDirectory()) throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
					if (!attrs) await promisify(sftp.mkdir.bind(sftp))(source);
					directoryModes.set(source, (attrs?.mode ?? 0o755) & 0o1777);
					await promisify(sftp.chmod.bind(sftp))(source, (attrs?.mode ?? 0o755) | 0o700);
				}
				for (const [name, member] of members) {
					signal.throwIfAborted();
					if (member.kind === 'symlink')
						await promisify(sftp.symlink.bind(sftp))(member.linkTarget!, posix.join(stage, name));
					else if (member.hardlink)
						this.#check(
							await native.createHardlink(stage, hardlinks.get(name)!.target, name, () => 300000, signal),
						);
					const attrs = await lstat(sftp, posix.join(stage, name));
					if (
						!attrs ||
						attrs.mode & 0o6000 ||
						(member.kind === 'file' &&
							(!attrs.isFile() || attrs.size !== (hardlinks.get(name)?.size ?? member.size)))
					)
						throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
				}
				await publishTree(sftp, stage, root, value.overwrite, signal, directoryModes);
			} finally {
				if (confirmed) {
					await removeTree(sftp, stage);
					await removeTree(sftp, snapshot);
				}
			}
		});
	}
}

async function lstat(sftp: SFTPWrapper, path: string) {
	try {
		return await promisify(sftp.lstat.bind(sftp))(path);
	} catch (cause) {
		if ((cause as { code?: number }).code === 2) return undefined;
		throw cause;
	}
}

async function removeTree(sftp: SFTPWrapper, path: string): Promise<void> {
	const attrs = await lstat(sftp, path);
	if (!attrs) return;
	if (attrs.isDirectory()) {
		for (const e of await promisify(sftp.readdir.bind(sftp))(path))
			if (e.filename !== '.' && e.filename !== '..') await removeTree(sftp, posix.join(path, e.filename));
		await promisify(sftp.rmdir.bind(sftp))(path);
	} else await promisify(sftp.unlink.bind(sftp))(path);
}

async function publishFile(sftp: SFTPWrapper, from: string, to: string, overwrite: boolean) {
	const previous = await lstat(sftp, to);
	if (previous && (!overwrite || previous.isDirectory())) throw new RemoteToolsError('REMOTE_TOOLS_FILE_EXISTS');
	const backup = to + '.nexus-replace-' + randomUUID();
	if (previous) await promisify(sftp.rename.bind(sftp))(to, backup);
	try {
		await promisify(sftp.rename.bind(sftp))(from, to);
	} catch (cause) {
		if (previous) await promisify(sftp.rename.bind(sftp))(backup, to);
		throw cause;
	}
	if (previous) await promisify(sftp.unlink.bind(sftp))(backup);
}

async function publishTree(
	sftp: SFTPWrapper,
	from: string,
	to: string,
	overwrite: boolean,
	signal: AbortSignal,
	directoryModes: ReadonlyMap<string, number>,
): Promise<void> {
	for (const entry of await promisify(sftp.readdir.bind(sftp))(from)) {
		if (entry.filename === '.' || entry.filename === '..') continue;
		signal.throwIfAborted();
		const source = posix.join(from, entry.filename),
			destination = posix.join(to, entry.filename);
		if (entry.attrs.isDirectory()) {
			const found = await lstat(sftp, destination);
			if (found && !found.isDirectory()) throw new RemoteToolsError('REMOTE_TOOLS_FILE_EXISTS');
			if (!found) await promisify(sftp.mkdir.bind(sftp))(destination);
			await publishTree(sftp, source, destination, overwrite, signal, directoryModes);
			if (!found)
				await promisify(sftp.chmod.bind(sftp))(
					destination,
					directoryModes.get(source) ?? entry.attrs.mode & 0o1777,
				);
		} else await publishFile(sftp, source, destination, overwrite);
	}
}
