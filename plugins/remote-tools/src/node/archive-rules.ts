import path from 'node:path';
import { RemoteToolsError } from './remote-tools-error.js';
import type { ArchiveFormat, ArchiveEntry, ArchiveLinkTarget, ArchiveHardlink } from '../shared/remote-file-types.js';
import type { NativeArchiveMember } from './archive-command-types.js';
const ARCHIVE_UNSAFE_CHARACTER = /[\x00-\x1f\x7f]/u;

/** Interpret a native listing only when it agrees with the independently
 * generated verbose metadata. In particular, filenames with embedded line
 * breaks and device or privileged entries are rejected.
 */
export function validateListing(
	names: readonly string[],
	modes: readonly NativeArchiveMember[],
	format: ArchiveFormat,
	archive: string,
): Map<string, ArchiveEntry> {
	if (names.length !== modes.length) {
		throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
	}
	const members = new Map<string, ArchiveEntry>();
	for (let i = 0; i < names.length; i++) {
		const raw = names[i];
		const metadata = modes[i];
		if (!raw || !metadata) {
			throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
		}
		if (metadata.kind === 'special' || (metadata.mode !== null && (metadata.mode & 0o6000) !== 0)) {
			throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
		}
		if (raw !== metadata.name) {
			throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
		}
		if (
			!raw ||
			raw.startsWith('/') ||
			raw.includes('\\') ||
			ARCHIVE_UNSAFE_CHARACTER.test(raw) ||
			Buffer.byteLength(raw, 'utf8') > 4096
		) {
			throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
		}
		let name = raw;
		while (format !== 'zip' && name.startsWith('./')) {
			name = name.slice(2);
		}
		if (name === '' && raw === './' && metadata.kind === 'directory') {
			continue;
		}
		const parts = name.replace(/\/$/u, '').split('/');
		if (parts.some((p) => !p || p === '.' || p === '..')) {
			throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
		}
		name = parts.join('/');
		if (members.has(name) || name === path.posix.basename(archive)) {
			throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
		}
		members.set(name, {
			kind: metadata.kind === 'hardlink' ? 'file' : metadata.kind,
			hardlink: metadata.kind === 'hardlink',
			size: metadata.size,
			mode: metadata.mode,
			rawName: raw,
			linkTarget: metadata.linkTarget,
		});
	}
	for (const [name] of members) {
		const components = name.split('/');
		for (let i = 1; i < components.length; i++) {
			const parentName = components.slice(0, i).join('/');
			const parent = members.get(parentName);
			if (parent && parent.kind !== 'directory') {
				throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
			}
		}
	}
	return members;
}

/** Resolve leaf link chains without collapsing unchecked directory traversal. */
export function resolveLinkTargets(members: ReadonlyMap<string, ArchiveEntry>): Map<string, ArchiveLinkTarget> {
	const targets = new Map<string, ArchiveLinkTarget>();
	for (const [name, member] of members) {
		if (member.kind !== 'symlink') {
			continue;
		}
		const visited = new Set<string>();
		const directories = new Set<string>();
		let current = name;
		let link: ArchiveEntry | undefined = member;
		while (link?.kind === 'symlink') {
			if (visited.has(current)) {
				throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
			}
			visited.add(current);
			const target = link.linkTarget;
			if (
				!target ||
				target.startsWith('/') ||
				target.includes('\\') ||
				ARCHIVE_UNSAFE_CHARACTER.test(target) ||
				Buffer.byteLength(target, 'utf8') > 4096
			) {
				throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
			}
			const directory = path.posix.dirname(current);
			const components = directory === '.' ? [] : directory.split('/');
			const parts = target.split('/');
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				if (part === '..') {
					if (!components.length) {
						throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
					}
					components.pop();
				} else if (part && part !== '.') {
					components.push(part);
				}
				const traversed = components.join('/') || '.';
				if (i < parts.length - 1) {
					const ancestor = members.get(traversed);
					if (ancestor && ancestor.kind !== 'directory') {
						throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
					}
					directories.add(traversed);
				}
			}
			current = components.join('/') || '.';
			link = members.get(current);
		}
		targets.set(name, { destination: current, directories: [...directories] });
	}
	return targets;
}

/** TAR hardlink targets are archive-root-relative and must end at a declared ordinary file. */
export function resolveHardlinkTargets(members: ReadonlyMap<string, ArchiveEntry>): Map<string, ArchiveHardlink> {
	const targets = new Map<string, ArchiveHardlink>();
	for (const [name, member] of members) {
		if (member.hardlink) {
			const visited = new Set([name]);
			let link = member;
			let target = name;
			while (link.hardlink) {
				const raw = link.linkTarget;
				if (
					!raw ||
					raw.startsWith('/') ||
					raw.includes('\\') ||
					ARCHIVE_UNSAFE_CHARACTER.test(raw) ||
					Buffer.byteLength(raw, 'utf8') > 4096
				) {
					throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
				}
				let normalized = raw;
				while (normalized.startsWith('./')) {
					normalized = normalized.slice(2);
				}
				if (
					normalized.split('/').some((part) => !part || part === '.' || part === '..') ||
					visited.has(normalized)
				) {
					throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
				}
				visited.add(normalized);
				const next = members.get(normalized);
				if (!next || next.kind !== 'file') {
					throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
				}
				link = next;
				target = normalized;
			}
			if (member.mode !== link.mode) {
				throw new RemoteToolsError('REMOTE_TOOLS_ARCHIVE_UNSAFE');
			}
			targets.set(name, { target, size: link.size });
		}
	}
	return targets;
}
