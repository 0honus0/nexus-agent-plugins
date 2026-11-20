import type { RemoteDirectory } from '../../shared/workspace-file-types';

const directoryTtl = 5 * 60 * 1000;

const maxDirectories = 20;

const maxEntries = 20_000;

const maxBytes = 8 * 1024 * 1024;

interface Snapshot {
	listing: RemoteDirectory;
	expiresAt: number;
	bytes: number;
}

/** Directory listings belong to one SSH session and one cache generation. */
export function createDirectoryCache(
	request: (path: string, signal: AbortSignal) => Promise<RemoteDirectory>,
	lifetime: AbortSignal,
) {
	const snapshots = new Map<string, Snapshot>();
	const pending = new Map<string, Promise<RemoteDirectory>>();
	let generation = new AbortController();
	let entries = 0;
	let bytes = 0;

	function remove(path: string): void {
		const cached = snapshots.get(path);
		if (!cached) return;
		snapshots.delete(path);
		entries -= cached.listing.entries.length;
		bytes -= cached.bytes;
	}

	function get(path: string): RemoteDirectory | undefined {
		const cached = snapshots.get(path);
		if (!cached) return;
		if (cached.expiresAt <= performance.now()) {
			remove(path);
			return;
		}
		snapshots.delete(path);
		snapshots.set(path, cached);
		return cached.listing;
	}

	function store(listing: RemoteDirectory): void {
		const size = listing.entries.reduce(
			(total, entry) => total + 160 + 2 * (entry.name.length + entry.path.length),
			2 * listing.path.length,
		);
		const count = listing.entries.length;
		remove(listing.path);
		if (count > maxEntries || size > maxBytes) return;

		while (snapshots.size >= maxDirectories || entries + count > maxEntries || bytes + size > maxBytes) {
			const oldest = snapshots.keys().next().value;
			if (oldest === undefined) break;
			remove(oldest);
		}
		snapshots.set(listing.path, { listing, expiresAt: performance.now() + directoryTtl, bytes: size });
		entries += count;
		bytes += size;
	}

	function read(path: string): Promise<RemoteDirectory> {
		const cached = get(path);
		if (cached) return Promise.resolve(cached);
		const existing = pending.get(path);
		if (existing) return existing;

		const signal = AbortSignal.any([lifetime, generation.signal]);
		const result = Promise.resolve()
			.then(() => {
				signal.throwIfAborted();
				return request(path, signal);
			})
			.then((listing) => {
				signal.throwIfAborted();
				store(listing);
				return listing;
			})
			.finally(() => {
				if (pending.get(path) === result) pending.delete(path);
			});
		pending.set(path, result);
		return result;
	}

	function invalidate(): void {
		generation.abort();
		generation = new AbortController();
		pending.clear();
		snapshots.clear();
		entries = 0;
		bytes = 0;
	}

	return {
		get,
		read,
		invalidate,

		idle: () => pending.size === 0,
	};
}
