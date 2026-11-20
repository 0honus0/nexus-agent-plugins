import { useWorkspaceTransfers } from './transfers/workspace-transfers';
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import { DirectorySchema, type FileEntry } from '../shared/workspace-file-types';
import { createDirectoryCache } from './files/directory-cache';
import { useWorkspaceFilesState } from './files/workspace-files-state';
import { createWorkspaceClient } from './workspace-client';

const prefetchDelay = 20;

export function useFiles(
	ctx: PluginContextApi,
	sessionId: string,
	viewSignal: AbortSignal,
	enabled: () => boolean,
	connected: () => boolean,
) {
	const shared = useWorkspaceFilesState();
	const lifetime = new AbortController();
	const signal = AbortSignal.any([viewSignal, ctx.signal, lifetime.signal]);
	const client = createWorkspaceClient(ctx, signal);
	const root = 'sessions/' + sessionId;
	const path = ref('.'),
		entries = shallowRef<FileEntry[]>([]),
		loaded = ref(false),
		loading = ref(false),
		mutating = ref(false);
	let revision = 0,
		appliedRevision = -1;
	let requestedPath = path.value;
	let prefetchTimer: ReturnType<typeof setTimeout> | undefined;
	let prefetchTarget: string | undefined;
	let rejectedPrefetchTarget: string | undefined;
	let prefetchRevision = 0;
	const transfers = useWorkspaceTransfers();
	const busy = computed(() => mutating.value);

	const directoryCache = createDirectoryCache(
		(remote, requestSignal) =>
			ctx.app.http.json(root + '/directory?' + new URLSearchParams({ path: remote }), DirectorySchema, {
				signal: requestSignal,
			}),
		signal,
	);

	function cancelPrefetch(): void {
		prefetchRevision++;
		clearTimeout(prefetchTimer);
		prefetchTimer = undefined;
		prefetchTarget = undefined;
	}

	function schedulePrefetch(): void {
		if (prefetchTarget && !prefetchTimer && !signal.aborted) prefetchTimer = setTimeout(runPrefetch, prefetchDelay);
	}

	function runPrefetch(): void {
		prefetchTimer = undefined;
		const target = prefetchTarget;
		if (!target || !enabled() || loading.value || !directoryCache.idle()) return;
		prefetchTarget = undefined;
		if (directoryCache.get(target)) return;
		const current = prefetchRevision;
		void directoryCache
			.read(target)
			.catch(() => {
				if (!signal.aborted && current === prefetchRevision) rejectedPrefetchTarget = target;
			})
			.finally(schedulePrefetch);
	}

	function prefetch(remote: string): void {
		if (
			signal.aborted ||
			!enabled() ||
			loading.value ||
			remote === path.value ||
			remote === rejectedPrefetchTarget ||
			directoryCache.get(remote)
		)
			return;
		clearTimeout(prefetchTimer);
		prefetchTimer = undefined;
		prefetchTarget = remote;
		schedulePrefetch();
	}

	function invalidate(): void {
		cancelPrefetch();
		rejectedPrefetchTarget = undefined;
		directoryCache.invalidate();
		revision++;
		appliedRevision = -1;
		loading.value = false;
	}

	async function navigate(remote: string) {
		cancelPrefetch();
		const current = ++revision;
		requestedPath = remote;
		const cached = directoryCache.get(remote);
		loading.value = !cached;
		try {
			const value = cached ?? (await directoryCache.read(remote));
			if (current !== revision || signal.aborted) return;
			requestedPath = value.path;
			path.value = value.path;
			entries.value = value.entries;
			loaded.value = true;
			appliedRevision = shared.revision.value;
			return value.path;
		} catch (cause) {
			if (current !== revision || signal.aborted) return;
			requestedPath = path.value;
			client.report(cause);
		} finally {
			if (current === revision) loading.value = false;
		}
	}

	async function load(remote?: string) {
		if (!enabled() || signal.aborted) return;
		if (remote === undefined) invalidate();
		return navigate(remote ?? requestedPath);
	}

	function upload(files: FileList | File[]) {
		transfers?.upload(
			sessionId,
			path.value,
			files,
			false,
			shared.sessions.value.find((item) => item.id === sessionId)?.name,
		);
	}

	function download(entry: FileEntry) {
		return transfers?.download(sessionId, entry.path);
	}

	watch(
		[enabled, connected, shared.revision],
		([active, online, current], [, wasOnline, previous]) => {
			if ((wasOnline && !online) || (previous !== undefined && current !== previous)) invalidate();
			if (!active) cancelPrefetch();
			if (active && online && !signal.aborted && appliedRevision !== current && !loading.value)
				void navigate(requestedPath);
		},
		{ immediate: true, flush: 'sync' },
	);
	onScopeDispose(() => {
		lifetime.abort();
		invalidate();
	});
	return {
		path,
		entries,
		loaded,
		loading,
		mutating,
		busy,
		load,
		prefetch,
		cancelPrefetch,
		upload,
		download,
	};
}
