import { posix } from 'node:path';
import type { FileSearchResult, RemoteDirectory } from '../shared/workspace-file-types';

/** SFTP-only search, matching legacy filename search. Never follows symlinks or executes a shell.
 * Bound traversal and output so a search from / cannot exhaust the host; partial results are explicit.
 * Cancelling a caller stops scheduling, without closing the SFTP channel shared by other operations.
 */
export async function searchRemoteFiles(
	list: (path: string) => Promise<RemoteDirectory>,
	path: string,
	query: string,
	signal: AbortSignal,
): Promise<FileSearchResult> {
	signal.throwIfAborted();
	const root = await list(path);
	const queue: RemoteDirectory[] = [root];
	const pendingPaths: string[] = [];
	const entries: FileSearchResult['entries'] = [];
	const normalized = query.toLocaleLowerCase();
	let scanned = 1,
		truncated = false;
	while (queue.length) {
		signal.throwIfAborted();
		for (const directory of queue.splice(0)) {
			for (const entry of directory.entries) {
				if (entry.name.toLocaleLowerCase().includes(normalized)) {
					if (entries.length === 1000) return { entries, truncated: true };
					entries.push({ ...entry, relativePath: posix.relative(root.path, entry.path) });
				}
				if (entry.kind === 'directory') {
					if (scanned + pendingPaths.length < 4096) pendingPaths.push(entry.path);
					else truncated = true;
				}
			}
		}
		while (pendingPaths.length && !queue.length) {
			signal.throwIfAborted();
			const batch = pendingPaths.splice(0, 8);
			scanned += batch.length;
			const results = await Promise.allSettled(batch.map(list));
			for (const result of results) {
				if (result.status === 'fulfilled') queue.push(result.value);
				else if ([2, 3].includes((result.reason as { code?: number }).code ?? -1)) truncated = true;
				else throw result.reason;
			}
		}
	}
	return { entries, truncated };
}
