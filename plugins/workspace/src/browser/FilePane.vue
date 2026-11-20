<script setup lang="ts">
	import { computed, ref, watch, nextTick } from 'vue';
	import { useDropZone, useClipboard } from '@vueuse/core';
	import {
		Search,
		Copy,
		Scissors,
		ClipboardPaste,
		FilePlus,
		Folder,
		Eye,
		EyeOff,
		ListFilter,
		RefreshCw,
		Upload,
		Download,
		FolderPlus,
		Pencil,
		Trash2,
		X,
		Check,
		CircleAlert,
		FolderSync,
		Terminal,
		Archive,
		Send,
		Shield,
	} from '@lucide/vue';
	import { UiButton, UiInput, UiEmptyState, UiDropdownMenu, UiContextMenu } from 'nexus-terminal/browser/ui';
	import type { UiMenuItem } from 'nexus-terminal/browser/ui';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import type { PluginWindowApi } from 'nexus-terminal/browser';
	import type { WorkspaceI18n } from './workspace-i18n';
	import type { FileEntry } from '../shared/workspace-file-types';
	import { useFileSearch } from './files/use-file-search';
	import FileIcon from './files/FileIcon.vue';
	import { filesPresentation } from './files/files-presentation';
	import PathFavorites from './files/PathFavorites.vue';
	import WorkspacePathBar from './files/WorkspacePathBar.vue';
	import FileOperationDialogs from './files/FileOperationDialogs.vue';
	import { useWorkspaceCatalog } from './catalog/workspace-catalog';
	import { useFileOperations } from './files/use-file-operations';
	import { useWorkspaceFilesState } from './files/workspace-files-state';
	import { usePanePresentation } from './presentation/pane-presentation';
	import { createWorkspaceClient } from './workspace-client';
	import { useFiles } from './use-files';
	const props = defineProps<{
		sessionId: string;
		enabled: boolean;
		connected: boolean;
		ctx: PluginContextApi;
		view: PluginWindowApi;
		i18n: WorkspaceI18n;
	}>();
	const emit = defineEmits<{ busy: [value: boolean] }>();
	const { t } = props.i18n;
	const signal = AbortSignal.any([props.ctx.signal, props.view.signal]);
	const client = createWorkspaceClient(props.ctx, signal),
		shared = useWorkspaceFilesState();
	const files = useFiles(
		props.ctx,
		props.sessionId,
		props.view.signal,
		() => props.enabled,
		() => props.connected,
	);
	const { path, loaded, loading, mutating, busy } = files;
	const catalog = useWorkspaceCatalog();
	const operations = useFileOperations(
		props.ctx,
		props.sessionId,
		signal,
		files,
		() => catalog.state.value.preferences.confirmFileDeletion,
	);
	const browserSearch = useFileSearch(props.ctx, props.sessionId, path, props.view.signal);
	const { query: search, searching, truncated } = browserSearch;
	const surface = ref<HTMLElement>(),
		searchExpanded = ref(false),
		showHidden = ref(false),
		sort = ref('name');
	const { style: fileScaleStyle } = usePanePresentation(surface, filesPresentation);
	const textClipboard = useClipboard({ legacy: true });
	const selected = ref<string[]>([]),
		anchor = ref(''),
		context = ref<FileEntry>();
	const syncing = ref<'toTerminal' | 'fromTerminal'>();

	function displayName(entry: FileEntry) {
		return 'relativePath' in entry ? String(entry.relativePath) : entry.name;
	}

	const parentPath = computed(() => path.value.replace(/\/[^/]+\/?$/, '') || '/');
	const parent = computed<FileEntry | undefined>(() =>
		loaded.value && path.value !== '/' && !browserSearch.active.value
			? { name: '..', path: parentPath.value, kind: 'directory', size: 0, modifiedAt: 0, mode: 0 }
			: undefined,
	);
	const names = new Intl.Collator(undefined, { numeric: true });
	const rows = computed(() =>
		(browserSearch.active.value && browserSearch.entries.value ? browserSearch.entries.value : files.entries.value)
			.filter(
				(entry) =>
					showHidden.value ||
					!displayName(entry)
						.split('/')
						.some((part) => part.startsWith('.')),
			)
			.sort(
				(a, b) =>
					Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
					(sort.value === 'size'
						? b.size - a.size
						: sort.value === 'modified'
							? b.modifiedAt - a.modifiedAt
							: 0) ||
					names.compare(a.name, b.name),
			),
	);
	const visibleRows = computed(() => (parent.value ? [parent.value, ...rows.value] : rows.value));
	const selectedEntries = computed(() => rows.value.filter((entry) => selected.value.includes(entry.path)));

	const isParent = (entry?: FileEntry) => entry?.name === '..';

	function prefetchEntry(entry: FileEntry, event?: PointerEvent) {
		if (event?.pointerType !== 'touch' && entry.kind === 'directory') files.prefetch(entry.path);
	}

	watch(path, () => {
		selected.value = [];
		anchor.value = '';
	});
	watch(files.entries, () => {
		if (browserSearch.active.value) void browserSearch.search();
	});
	watch(
		() => busy.value || !!syncing.value,
		(value) => emit('busy', value),
		{ immediate: true },
	);
	watch(visibleRows, (value) => {
		selected.value = selected.value.filter((p) => value.some((e) => e.path === p));
	});

	function up() {
		void files.load(parentPath.value);
	}

	function select(entry: FileEntry, event?: MouseEvent) {
		if (event?.shiftKey && anchor.value) {
			const keys = visibleRows.value.map((e) => e.path),
				a = keys.indexOf(anchor.value),
				b = keys.indexOf(entry.path);
			selected.value = keys.slice(Math.min(Math.max(a, 0), b), Math.max(a, b) + 1);
		} else if (event?.ctrlKey || event?.metaKey) {
			selected.value = selected.value.includes(entry.path)
				? selected.value.filter((p) => p !== entry.path)
				: [...selected.value, entry.path];
			anchor.value = entry.path;
		} else {
			selected.value = [entry.path];
			anchor.value = entry.path;
			if (event && (entry.kind === 'directory' || entry.kind === 'link')) void files.load(entry.path);
		}
	}

	function targets(entry?: FileEntry) {
		if (!entry || isParent(entry)) return [];
		return selected.value.includes(entry.path) ? selectedEntries.value : [entry];
	}

	function prepareContext(entry?: FileEntry) {
		context.value = entry;
		if (entry && !selected.value.includes(entry.path)) {
			selected.value = [entry.path];
			anchor.value = entry.path;
		}
	}

	const archiveFormat = (name: string) =>
		/\.zip$/i.test(name)
			? 'zip'
			: /\.(?:tar\.gz|tgz)$/i.test(name)
				? 'tar.gz'
				: /\.(?:tar\.bz2|tbz2?)$/i.test(name)
					? 'tar.bz2'
					: undefined;

	function entryItems(entry?: FileEntry): UiMenuItem[] {
		const entries = targets(entry);
		const first = entries[0];
		const single = entries.length === 1;
		const noTargets = !entries.length;
		return [
			...(entry?.kind === 'directory' || entry?.kind === 'link'
				? [{ id: 'open', label: t('openDirectory'), icon: Folder }]
				: []),
			{ id: 'file', label: t('file'), icon: FilePlus },
			{ id: 'mkdir', label: t('mkdir'), icon: FolderPlus },
			{ id: 'copy', label: t('filesMenu.copy'), icon: Copy, disabled: noTargets, separatorBefore: true },
			{ id: 'cut', label: t('filesMenu.cut'), icon: Scissors, disabled: noTargets },
			{
				id: 'paste',
				label: t('filesMenu.paste'),
				icon: ClipboardPaste,
				disabled: !shared.clipboard.value,
			},
			{ id: 'send', label: t('filesMenu.send'), icon: Send, disabled: noTargets },
			{
				id: 'compress',
				label: t('filesMenu.compress'),
				icon: Archive,
				disabled: noTargets,
				separatorBefore: true,
			},
			...(single && archiveFormat(first.name)
				? [{ id: 'extract', label: t('filesMenu.extract'), icon: Archive }]
				: []),
			{ id: 'permissions', label: t('filesMenu.permissions'), icon: Shield, disabled: noTargets },
			{ id: 'rename', label: t('rename'), icon: Pencil, disabled: !single },
			{ id: 'download', label: t('download'), icon: Download, disabled: !single || first.kind === 'directory' },
			{
				id: 'remove',
				label: t('remove'),
				icon: Trash2,
				disabled: noTargets,
				tone: 'danger',
				separatorBefore: true,
			},
			{ id: 'copyPath', label: t('copyPath'), icon: Copy, separatorBefore: true },
		];
	}

	async function menuAction(id: string, entry = context.value) {
		if (
			!props.enabled ||
			!loaded.value ||
			busy.value ||
			!entryItems(entry).some((item) => item.id === id && !item.disabled)
		)
			return;
		const entries = targets(entry),
			directory = entry?.kind === 'directory' ? entry.path : path.value;
		if (id === 'open' && entry) await files.load(entry.path);
		else if (id === 'copy' || id === 'cut')
			shared.copy(
				props.sessionId,
				entries.map((e) => e.path),
				id,
			);
		else if (id === 'paste') await operations.paste(directory);
		else if (id === 'download' && entries[0]) await files.download(entries[0]);
		else if (id === 'copyPath') {
			try {
				await textClipboard.copy(entry?.path ?? path.value);
			} catch (cause) {
				client.report(cause);
			}
		} else if (id === 'file' || id === 'mkdir') operations.open(id, [], directory);
		else if (id === 'compress') operations.open('compress', entries, path.value);
		else if (id === 'extract' && entries[0])
			operations.open('extract', entries, path.value, archiveFormat(entries[0].name));
		else if (id === 'rename' || id === 'remove' || id === 'permissions' || id === 'send')
			operations.open(id, entries, path.value);
	}

	async function synchronize(direction: 'toTerminal' | 'fromTerminal') {
		if (syncing.value) return;
		syncing.value = direction;
		try {
			const value = (await client.request(
				'sessions/' + props.sessionId + '/terminal-directory',
				direction === 'toTerminal' ? 'POST' : 'GET',
				direction === 'toTerminal' ? { path: path.value } : undefined,
			)) as { path: string };
			if (direction === 'fromTerminal') await files.load(value.path);
		} catch (cause) {
			client.report(cause);
		} finally {
			syncing.value = undefined;
		}
	}

	function shortcut(event: KeyboardEvent) {
		if (
			!props.enabled ||
			loading.value ||
			busy.value ||
			operations.state.kind ||
			operations.state.overwrite ||
			event.defaultPrevented ||
			event.isComposing
		)
			return;
		if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"],[role="menu"]')) return;
		let action: (() => void) | undefined;
		const key = event.key.toLowerCase(),
			mod = event.ctrlKey || event.metaKey;
		const entry = visibleRows.value.find((e) => e.path === selected.value.at(-1));
		if (mod && key === 'c')
			action = () => {
				if (selectedEntries.value.length)
					shared.copy(
						props.sessionId,
						selectedEntries.value.map((e) => e.path),
						'copy',
					);
			};
		else if (mod && key === 'x')
			action = () => {
				if (selectedEntries.value.length)
					shared.copy(
						props.sessionId,
						selectedEntries.value.map((e) => e.path),
						'cut',
					);
			};
		else if (mod && key === 'v')
			action = () => {
				void operations.paste(isParent(entry) ? parentPath.value : path.value);
			};
		else if (mod && key === 'a')
			action = () => {
				selected.value = rows.value.map((e) => e.path);
			};
		else if ((event.altKey && key === 'arrowup') || key === 'backspace') action = up;
		else if (key === 'f5')
			action = () => {
				void files.load();
			};
		else if (key === 'f2' && selectedEntries.value.length === 1)
			action = () => operations.open('rename', selectedEntries.value);
		else if (key === 'delete' && selectedEntries.value.length)
			action = () => operations.open('remove', selectedEntries.value);
		else if (mod && event.shiftKey && key === 'n') action = () => operations.open('mkdir', []);
		else if (key === 'enter' && entry)
			action = () => {
				if (entry.kind === 'directory' || entry.kind === 'link') void files.load(entry.path);
			};
		else if (key === 'arrowdown' || key === 'arrowup')
			action = () => {
				const index = visibleRows.value.findIndex((e) => e.path === entry?.path),
					next =
						visibleRows.value[
							Math.max(0, Math.min(visibleRows.value.length - 1, index + (key === 'arrowdown' ? 1 : -1)))
						];
				if (next) {
					selected.value = [next.path];
					prefetchEntry(next);
					nextTick(() =>
						surface.value
							?.querySelector<HTMLElement>('[aria-pressed="true"]')
							?.scrollIntoView({ block: 'nearest' }),
					);
				}
			};
		if (action) {
			event.preventDefault();
			event.stopPropagation();
			action();
		}
	}

	async function showSearch() {
		searchExpanded.value = true;
		await nextTick();
		surface.value?.querySelector<HTMLInputElement>('.workspace-file-search input')?.focus();
	}

	function closeSearch() {
		search.value = '';
		searchExpanded.value = false;
	}

	const { isOverDropZone } = useDropZone(surface, {
		checkValidity: (items) => !!items.length && Array.from(items).every((item) => item.kind === 'file'),

		onDrop(dropped, event) {
			if (!props.enabled || !loaded.value || busy.value) return;
			if (Array.from(event.dataTransfer?.items ?? []).some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
				props.ctx.app.log.report({
					level: 'warn',
					code: 'WORKSPACE_DROP_FILES_ONLY',
					userVisible: true,
				});
				return;
			}
			if (dropped?.length) void files.upload(dropped);
		},
	});

	function size(bytes: number) {
		const unit = bytes < 1024 ? 'B' : bytes < 1024 ** 2 ? 'KiB' : bytes < 1024 ** 3 ? 'MiB' : 'GiB';
		const divisor = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }[unit];
		return props.i18n.n(Math.round((bytes / divisor) * 10) / 10) + ' ' + unit;
	}
</script>
<template>
	<section ref="surface" class="workspace-files" :aria-label="t('files')" tabindex="0" @keydown="shortcut">
		<div class="workspace-file-tools">
			<template v-if="!searchExpanded">
				<UiButton
					appearance="ghost"
					icon-only
					:aria-label="t('refreshFiles')"
					:title="t('refreshFiles')"
					:loading="loading"
					:disabled="!enabled"
					@click="files.load()"
					><RefreshCw :size="16"
				/></UiButton>
				<UiButton
					appearance="ghost"
					icon-only
					:aria-label="t('searchFiles')"
					:title="t('searchFiles')"
					:disabled="!enabled || !loaded"
					@click="showSearch"
					><Search :size="16"
				/></UiButton>
				<UiDropdownMenu
					:items="[
						{ id: 'name', label: t('sortName') },
						{ id: 'size', label: t('sortSize') },
						{ id: 'modified', label: t('sortModified') },
					]"
					@select="sort = $event"
					><UiButton appearance="ghost" icon-only :aria-label="t('sortFiles')" :title="t('sortFiles')"
						><ListFilter :size="16" /></UiButton
				></UiDropdownMenu>
				<UiButton
					appearance="ghost"
					icon-only
					:aria-label="t('showHidden')"
					:title="t('showHidden')"
					:aria-pressed="showHidden"
					@click="showHidden = !showHidden"
					><component :is="showHidden ? Eye : EyeOff" :size="16"
				/></UiButton>
				<UiButton
					appearance="ghost"
					icon-only
					:aria-label="t('filesMenu.terminalToFiles')"
					:title="t('filesMenu.terminalToFiles')"
					:loading="syncing === 'toTerminal'"
					:disabled="!enabled || !loaded || !!syncing"
					@click="synchronize('toTerminal')"
					><Terminal :size="16"
				/></UiButton>
				<UiButton
					appearance="ghost"
					icon-only
					:aria-label="t('filesMenu.filesToTerminal')"
					:title="t('filesMenu.filesToTerminal')"
					:loading="syncing === 'fromTerminal'"
					:disabled="!enabled || !!syncing"
					@click="synchronize('fromTerminal')"
					><FolderSync :size="16"
				/></UiButton>
			</template>
			<form
				v-else
				class="workspace-file-search"
				@submit.prevent="browserSearch.search()"
				@keydown.esc.stop.prevent="closeSearch"
			>
				<UiButton
					type="submit"
					appearance="ghost"
					icon-only
					:aria-label="t('searchFiles')"
					:title="t('searchFiles')"
					:loading="searching"
					><Search :size="16"
				/></UiButton>
				<div class="workspace-file-search-input">
					<UiInput v-model="search" :aria-label="t('searchFiles')" :placeholder="t('searchFiles')" />
				</div>
				<UiButton
					appearance="ghost"
					icon-only
					:aria-label="t('closeSearch')"
					:title="t('closeSearch')"
					@click="closeSearch"
					><X :size="16"
				/></UiButton>
			</form>
			<PathFavorites :path="path" :enabled="enabled && loaded" :i18n="i18n" @navigate="files.load($event)" />
		</div>
		<WorkspacePathBar
			:ctx="ctx"
			:signal="signal"
			:i18n="i18n"
			:path="path"
			:loaded="loaded"
			:enabled="enabled"
			:navigate="files.load"
		/>
		<p v-if="browserSearch.active.value && truncated" class="workspace-search-limit">
			{{ t('searchTruncated') }}
		</p>
		<div class="workspace-file-viewport">
			<UiContextMenu
				:items="entryItems(context)"
				:disabled="!enabled || !loaded || mutating"
				@select="menuAction($event, context)"
			>
				<div
					class="workspace-file-list"
					:style="fileScaleStyle"
					:aria-busy="loading || searching"
					tabindex="0"
					@pointerdown.capture="context = undefined"
					@contextmenu.capture="context = undefined"
				>
					<button
						v-for="entry in visibleRows"
						:key="entry.path"
						class="workspace-file-row"
						:class="{
							'is-selected': selected.includes(entry.path),
							'is-cut':
								shared.clipboard.value?.operation === 'cut' &&
								shared.clipboard.value.sourceSessionId === sessionId &&
								shared.clipboard.value.paths.includes(entry.path),
						}"
						:aria-label="isParent(entry) ? t('parentDirectory') : displayName(entry)"
						:aria-pressed="selected.includes(entry.path)"
						:disabled="!enabled"
						@click="select(entry, $event)"
						@contextmenu="prepareContext(entry)"
						@pointerdown="context = entry"
						@pointerenter="prefetchEntry(entry, $event)"
						@pointerleave="files.cancelPrefetch"
					>
						<FileIcon :name="entry.name" :kind="entry.kind" /><span
							class="workspace-file-name"
							:title="displayName(entry)"
							>{{ displayName(entry) }}</span
						><span class="workspace-file-size">{{
							isParent(entry)
								? t('parentDirectory')
								: entry.kind === 'directory'
									? t('directory')
									: size(entry.size)
						}}</span>
					</button>
					<UiEmptyState
						v-if="loaded && !rows.length && !searching"
						:title="t(browserSearch.active.value ? 'noFilesMatch' : 'emptyDirectory')"
						:icon="Folder"
					/>
				</div>
			</UiContextMenu>
		</div>
		<div v-if="isOverDropZone && enabled && loaded && !busy" class="workspace-file-drop" aria-hidden="true">
			<Upload :size="30" /><span>{{ t('dropFiles') }}</span>
		</div>
	</section>
	<FileOperationDialogs :operations="operations" :busy="mutating" :i18n="i18n" :session-id="sessionId" />
</template>
<style scoped>
	.workspace-files {
		position: relative;
		overflow: hidden;
	}
	.workspace-file-tools {
		border-bottom: 1px solid var(--ui-border);
		padding: 6px;
		gap: 5px;
	}
	.workspace-file-tools :deep(.ui-button) {
		--ui-button-height: 30px;
		width: 30px;
		min-width: 30px;
		padding: 5px;
		border: 1px solid color-mix(in srgb, var(--ui-border) 75%, transparent);
		border-radius: 7px;
	}
	.workspace-file-tools :deep(.ui-button[aria-pressed='true']) {
		color: var(--ui-primary);
		background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
	}
	.workspace-file-search {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}
	.workspace-file-search-input {
		flex: 1;
		min-width: 0;
		--ui-control-height: 30px;
	}
	.workspace-file-search-input :deep(.ui-input) {
		width: 100%;
		font-size: 12px;
	}
	.workspace-file-viewport {
		flex: 1 1 0;
		min-height: 0;
		overflow: clip;
	}
	.workspace-file-list {
		box-sizing: border-box;
		container: workspace-files / inline-size;
		min-height: 0;
		padding: 4px 6px;
	}
	.workspace-file-row {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) auto;
		align-items: center;
		gap: 8px;
		width: 100%;
		border: 0;
		background: none;
		color: var(--ui-text);
		text-align: start;
		border-radius: 7px;
		padding: 9px 6px;
		font-size: 12px;
		cursor: pointer;
	}
	.workspace-file-row.is-cut {
		opacity: 0.45;
	}
	.workspace-file-row:focus-visible {
		outline: 2px solid var(--ui-primary);
		outline-offset: -2px;
	}
	.workspace-file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@container workspace-files (max-width: 300px) {
		.workspace-file-row {
			grid-template-columns: 18px minmax(0, 1fr);
		}
		.workspace-file-size {
			display: none;
		}
	}
	.workspace-file-drop {
		position: absolute;
		inset: 6px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		border: 2px dashed var(--ui-primary);
		border-radius: 12px;
		background: color-mix(in srgb, var(--ui-surface) 92%, transparent);
		color: var(--ui-primary);
		pointer-events: none;
		z-index: 2;
	}
	.workspace-search-limit {
		margin: 0;
		padding: 5px 10px;
		font-size: 11px;
		color: var(--ui-muted);
	}
</style>
