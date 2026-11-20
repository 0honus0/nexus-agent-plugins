import { useWorkspaceTransfers } from './transfers/workspace-transfers';
import { computed, onScopeDispose, ref, watch } from 'vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import { isHttpRequestCanceled } from './workspace-client.js';
import { DirectorySchema, type FileEntry } from '../shared/workspace-file-types';
import { useWorkspaceFilesState } from './files/workspace-files-state';
import { createWorkspaceClient } from './workspace-client';

export function useFiles(ctx: PluginContextApi, sessionId: string, viewSignal: AbortSignal, enabled: () => boolean) {
	const shared = useWorkspaceFilesState();
	const lifetime = new AbortController();
	const signal = AbortSignal.any([viewSignal, ctx.signal, lifetime.signal]);
	const client = createWorkspaceClient(ctx, signal);
	const root = 'sessions/' + sessionId;
	const path = ref('.'),
		entries = ref<FileEntry[]>([]),
		loaded = ref(false),
		loading = ref(false),
		mutating = ref(false);
	let revision = 0,
		appliedRevision = -1;
	const rows = computed(() =>
		[...entries.value].sort(
			(a, b) =>
				Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
				a.name.localeCompare(b.name, undefined, { numeric: true }),
		),
	);
	const transfers = useWorkspaceTransfers();
	const busy = computed(() => mutating.value);

	const endpoint = (suffix: string, remote: string) => root + suffix + '?' + new URLSearchParams({ path: remote });

	async function load(remote = path.value) {
		const current = ++revision;
		const requestedRevision = shared.revision.value;
		loading.value = true;
		try {
			const value = await client.request(endpoint('/directory', remote), undefined, undefined, DirectorySchema);
			if (current !== revision || signal.aborted) return;
			path.value = value.path;
			entries.value = value.entries;
			loaded.value = true;
			appliedRevision = requestedRevision;
		} catch (cause) {
			client.report(cause);
		} finally {
			if (current === revision) {
				loading.value = false;
				if (requestedRevision !== shared.revision.value && enabled() && !signal.aborted) void load();
			}
		}
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
		[enabled, shared.revision],
		([value]) => {
			if (value && (!loaded.value || appliedRevision !== shared.revision.value) && !loading.value) void load();
		},
		{ immediate: true },
	);
	onScopeDispose(() => {
		lifetime.abort();
	});
	return {
		path,
		rows,
		loaded,
		loading,
		mutating,
		busy,
		load,
		upload,
		download,
	};
}
