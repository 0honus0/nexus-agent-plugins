import { TransferTaskSchema } from '../../shared/workspace-transfer-types';
import { useWorkspaceTransfers } from '../transfers/workspace-transfers';
import { computed, reactive, onScopeDispose, watch } from 'vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import type { FileEntry } from '../../shared/workspace-file-types';
import { RemoteNameSchema, DirectorySchema } from '../../shared/workspace-file-types';
import { createWorkspaceClient } from '../workspace-client';
import { useWorkspaceFilesState } from './workspace-files-state';

export type FileOperation = 'mkdir' | 'file' | 'rename' | 'remove' | 'permissions' | 'compress' | 'extract' | 'send';

/** Dialog state captures a selection. Menu changes never retarget an in-flight operation. */
export function useFileOperations(
	ctx: PluginContextApi,
	sessionId: string,
	signal: AbortSignal,
	files: {
		path: { value: string };
		mutating: { value: boolean };
		load(path?: string): Promise<void>;
	},
	confirmDeletion: () => boolean = () => true,
) {
	const lifetime = new AbortController();
	signal = AbortSignal.any([signal, lifetime.signal]);
	onScopeDispose(() => lifetime.abort());
	const shared = useWorkspaceFilesState(),
		client = createWorkspaceClient(ctx, signal);
	let browseGeneration = 0;
	const transfers = useWorkspaceTransfers();
	const pendingCuts = new Map<string, string>();
	watch(
		() => transfers?.tasks.value,
		(items) => {
			for (const item of items ?? []) {
				const generation = pendingCuts.get(item.id);
				if (!generation) continue;
				if (item.state === 'completed') {
					shared.consumed(generation);
					pendingCuts.delete(item.id);
				} else if (['failed', 'canceled', 'unknown'].includes(item.state)) pendingCuts.delete(item.id);
			}
		},
	);
	const state = reactive({
		kind: undefined as FileOperation | undefined,
		entries: [] as FileEntry[],
		directory: '/',
		name: '',
		mode: '644',
		format: 'zip',
		password: '',
		encrypted: false,
		destination: '/',
		server: '',
		overwrite: false,
		browsing: false,
		directories: [] as FileEntry[],
		reading: false,
	});
	let retry: ((overwrite: boolean) => Promise<void>) | undefined;
	const sessions = computed(() => shared.sessions.value.filter((s) => s.id !== sessionId && s.state !== 'suspended'));
	const destinationSession = computed(() => sessions.value.find((s) => s.connectionId === state.server));
	const servers = computed(() =>
		shared.connections.value.filter((c) => c.type === 'ssh').map((c) => ({ value: c.id, label: c.name })),
	);
	const valid = computed(() => {
		if (state.kind === 'remove') return state.entries.length > 0;
		if (state.kind === 'permissions') return /^[0-7]{3,4}$/.test(state.mode);
		if (state.kind === 'send') return !!destinationSession.value && state.destination.startsWith('/');
		if (state.kind === 'extract') return state.destination.startsWith('/');
		return (
			RemoteNameSchema.safeParse(state.name).success &&
			(state.kind !== 'compress' || !state.encrypted || state.password.length > 0)
		);
	});

	async function perform(action: (overwrite: boolean) => Promise<void>, overwrite = false, allowOverwrite = true) {
		if (files.mutating.value) return;
		files.mutating.value = true;
		try {
			await action(overwrite);
			shared.changed();
			state.kind = undefined;
			state.password = '';
			state.overwrite = false;
			retry = undefined;
		} catch (cause) {
			const code = (cause as { response?: { data?: { code?: string } } })?.response?.data?.code;
			if (allowOverwrite && !overwrite && code === 'WORKSPACE_FILE_EXISTS') {
				retry = action;
				state.overwrite = true;
			} else client.report(cause);
		} finally {
			files.mutating.value = false;
		}
	}

	function open(
		kind: FileOperation,
		entries: FileEntry[],
		directory = files.path.value,
		format = 'zip',
		encrypted = false,
	) {
		if (files.mutating.value || (kind === 'remove' && !entries.length)) return;
		// All deletion entry points use this policy; direct deletion never opens a transient dialog.
		if (kind === 'remove' && !confirmDeletion()) return remove(entries);
		Object.assign(state, {
			kind,
			entries: [...entries],
			directory: kind === 'rename' ? entries[0].path.replace(/\/[^/]+$/, '') || '/' : directory,
			name:
				kind === 'rename'
					? (entries[0]?.name ?? '')
					: kind === 'compress'
						? (entries.length === 1 ? entries[0].name : 'archive') + '.' + format
						: '',
			mode: ((entries[0]?.mode ?? 0o644) & 0o7777).toString(8),
			format,
			password: '',
			encrypted,
			destination: directory,
			server: '',
			overwrite: false,
			browsing: false,
		});
	}

	const post = (suffix: string, data: unknown, id = sessionId) =>
		client.request('sessions/' + id + suffix, 'POST', data).then(() => {});

	function paste(directory = files.path.value) {
		const clipboard = shared.clipboard.value;
		if (!clipboard) return;
		return perform(async (overwrite) => {
			const task = await client.request(
				'sessions/' + sessionId + '/files/transfer',
				'POST',
				{
					sourceSessionId: clipboard.sourceSessionId,
					paths: clipboard.paths,
					destination: directory,
					move: clipboard.operation === 'cut',
					overwrite,
				},
				TransferTaskSchema,
			);
			if (transfers && task?.id) {
				const current = transfers.tasks.value.find((item) => item.id === task.id);
				if (current?.state === 'completed') shared.consumed(clipboard.generation);
				else if (!current || !['failed', 'canceled', 'unknown'].includes(current.state))
					pendingCuts.set(task.id, clipboard.generation);
			} else shared.consumed(clipboard.generation);
		});
	}

	function remove(entries: FileEntry[]) {
		const paths = entries.map((entry) => entry.path);
		return perform(() => post('/files/remove', { paths }), false, false);
	}

	async function save() {
		if (!valid.value || !state.kind) return;
		if (state.kind === 'remove') return remove(state.entries);
		const value = { ...state, entries: [...state.entries] },
			paths = value.entries.map((e) => e.path);
		const target = value.directory.replace(/\/$/, '') + '/' + value.name;
		const targetId = destinationSession.value?.id;
		await perform(
			async (overwrite) => {
				switch (value.kind) {
					case 'mkdir':
					case 'file':
						await post('/files', { mutation: { operation: value.kind, path: target } });
						break;
					case 'rename':
						await post('/files', {
							mutation: { operation: 'rename', path: paths[0], destination: target },
						});
						break;
					case 'permissions':
						await post('/files/permissions', { paths, mode: parseInt(value.mode, 8) });
						break;
					case 'compress':
						await post('/files/compress', {
							paths,
							destination: target,
							format: value.format,
							password: value.encrypted ? value.password : undefined,
							overwrite,
						});
						break;
					case 'extract':
						await post('/files/extract', {
							archive: paths[0],
							destination: value.destination,
							format: value.format,
							password: value.password || undefined,
							overwrite,
						});
						break;
					case 'send':
						await post(
							'/files/transfer',
							{
								sourceSessionId: sessionId,
								paths,
								destination: value.destination,
								move: false,
								overwrite,
							},
							targetId,
						);
						break;
				}
			},
			false,
			['compress', 'extract', 'send'].includes(value.kind!),
		);
	}

	async function browse(directory = state.destination) {
		const generation = ++browseGeneration;
		const server = state.server;
		const id = state.kind === 'send' ? destinationSession.value?.id : sessionId;
		if (!id || state.reading) return;
		state.reading = true;
		try {
			const result = await client.request(
				'sessions/' + id + '/directory?' + new URLSearchParams({ path: directory }),
				undefined,
				undefined,
				DirectorySchema,
			);
			if (generation !== browseGeneration || server !== state.server || signal.aborted) return;
			state.destination = result.path;
			state.directories = result.entries.filter((e) => e.kind === 'directory');
			state.browsing = true;
		} catch (cause) {
			client.report(cause);
		} finally {
			state.reading = false;
		}
	}

	function setFormat(value: string | undefined) {
		if (!value) return;
		const format = value === 'encrypted-zip' ? 'zip' : value;
		if (state.name.endsWith('.' + state.format)) state.name = state.name.slice(0, -state.format.length) + format;
		state.format = format;
		state.encrypted = value === 'encrypted-zip';
		if (!state.encrypted) state.password = '';
	}

	return {
		setFormat,
		state,
		valid,
		sessions,
		servers,
		destinationSession,
		open,
		save,
		paste,
		browse,

		connect: () => shared.connect(state.server),

		close() {
			if (!files.mutating.value) {
				state.kind = undefined;
				state.overwrite = false;
				retry = undefined;
			}
		},

		confirmOverwrite: () => retry && perform(retry, true),
	};
}

export type FileOperations = ReturnType<typeof useFileOperations>;
