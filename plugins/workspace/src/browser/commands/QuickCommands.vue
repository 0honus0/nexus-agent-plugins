<script setup lang="ts">
	import { computed, ref, nextTick, watch } from 'vue';
	import { useClipboard, useStorage } from '@vueuse/core';
	import {
		Terminal,
		Plus,
		Play,
		Pencil,
		Trash2,
		Tags,
		ChevronDown,
		Copy,
		Send,
		Search,
		X,
		ArrowDownAZ,
		ListOrdered,
		Clock3,
		Minimize2,
		Maximize2,
	} from '@lucide/vue';
	import { UiButton, UiInput, UiDialog, UiField, UiEmptyState, UiContextMenu } from 'nexus-terminal/browser/ui';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import { CommandInputSchema, type QuickCommand } from '../../shared/workspace-catalog-types';
	import { commandVariables, expandCommand } from './command-expansion';
	import { useCommandTargets } from './command-targets';
	import { useWorkspaceCatalog } from '../catalog/workspace-catalog';
	const props = defineProps<{ sessionId: string; i18n: WorkspaceI18n; ctx: PluginContextApi }>();
	const { t } = props.i18n;
	const catalog = useWorkspaceCatalog(),
		targets = useCommandTargets();
	const root = ref<HTMLElement>();
	const searchExpanded = ref(false);
	const search = ref(''),
		sort = ref('name');
	const compact = useStorage('nexus.workspace.commands.compact', false, undefined, {
		onError: catalog.report,
	});
	const displayMode = useStorage('nexus.workspace.commands.display', 'command', undefined, {
		onError: catalog.report,
	});
	const collapsed = ref(new Set<string>());
	const focusedId = ref<string>();
	const removing = ref<QuickCommand>();
	const clipboard = useClipboard({ legacy: true });
	const editing = ref(false),
		selected = ref<QuickCommand>(),
		name = ref(''),
		command = ref(''),
		tags = ref(''),
		variables = ref<Record<string, string>>({});
	const executing = ref<QuickCommand>(),
		values = ref<Record<string, string>>({}),
		recipients = ref<{ id: string; name: string }[]>([]);
	const groups = computed(() => {
		const items = catalog.state.value.commands
			.filter((item) =>
				(item.name + item.command + item.tags.join(' ')).toLowerCase().includes(search.value.toLowerCase()),
			)
			.sort((a, b) =>
				sort.value === 'usage'
					? b.usageCount - a.usageCount
					: sort.value === 'recent'
						? (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
						: a.name.localeCompare(b.name),
			);
		const grouped = new Map<string, QuickCommand[]>();
		for (const item of items) {
			for (const key of item.tags.length ? item.tags : ['']) {
				grouped.set(key, [...(grouped.get(key) ?? []), item]);
			}
		}
		return [...grouped].map(([name, items]) => ({ name, items }));
	});
	const draft = computed(() => ({
		name: name.value,
		command: command.value,
		tags: tags.value
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean),
		variables: Object.fromEntries(commandVariables(command.value).map((key) => [key, variables.value[key] ?? ''])),
	}));
	const expanded = computed(() => (executing.value ? expandCommand(executing.value.command, values.value) : ''));

	function edit(item?: QuickCommand) {
		selected.value = item;
		name.value = item?.name ?? '';
		command.value = item?.command ?? '';
		tags.value = item?.tags.join(', ') ?? '';
		variables.value = { ...item?.variables };
		editing.value = true;
	}

	async function save() {
		if (await catalog.save('commands', draft.value, selected.value)) editing.value = false;
	}

	async function send(item: QuickCommand, text: string, ids: string[]) {
		if (!text || text.length > 32766 || new TextEncoder().encode(text).byteLength > 60000) {
			catalog.report({ code: 'WORKSPACE_COMMAND_INVALID' });
			return;
		}
		const count = targets.send(ids, text);
		if (!count) {
			catalog.report({ code: 'WORKSPACE_SESSION_NOT_FOUND' });
			return;
		}
		await catalog.used(item.id);
		props.ctx.app.log.report({
			level: 'info',
			code: 'WORKSPACE_COMMAND_SENT',
			params: { count },
			userVisible: true,
		});
		executing.value = undefined;
	}

	function run(item: QuickCommand, all = false) {
		const list = targets.list().filter((target) => all || target.id === props.sessionId);
		if (!list.length) {
			catalog.report({ code: 'WORKSPACE_SESSION_NOT_FOUND' });
			return;
		}
		if (all || commandVariables(item.command).length) {
			executing.value = item;
			values.value = { ...item.variables };
			recipients.value = list;
		} else
			void send(
				item,
				item.command,
				list.map((target) => target.id),
			);
	}

	const sortLabel = computed(() =>
		t(sort.value === 'usage' ? 'tools.mostUsed' : sort.value === 'recent' ? 'tools.recent' : 'sortName'),
	);

	function cycleSort() {
		const options = ['name', 'usage', 'recent'];
		sort.value = options[(options.indexOf(sort.value) + 1) % options.length];
	}

	const sortIcon = computed(() =>
		sort.value === 'usage' ? ListOrdered : sort.value === 'recent' ? Clock3 : ArrowDownAZ,
	);
	watch([search, sort], () => {
		focusedId.value = undefined;
	});

	async function openSearch() {
		searchExpanded.value = true;
		await nextTick();
		root.value?.querySelector<HTMLInputElement>('.workspace-quick-search input')?.focus();
	}

	function clearSearch() {
		search.value = '';
		void openSearch();
	}

	function blurSearch(event: FocusEvent) {
		if (event.target instanceof Element && event.target.closest('.workspace-quick-search-toggle')) return;
		const next = event.relatedTarget;
		if (
			next instanceof Node &&
			(root.value?.querySelector('.workspace-quick-list')?.contains(next) ||
				root.value?.querySelector('.workspace-quick-controls')?.contains(next))
		)
			return;
		focusedId.value = undefined;
		if (!search.value) searchExpanded.value = false;
	}

	function closeSearchAfterAction(event: MouseEvent) {
		// Keep toolbar targets in place until their click has completed.
		const target = event.target;
		if (
			target instanceof Element &&
			!target.closest('.workspace-quick-search-toggle, .workspace-quick-search') &&
			!search.value
		)
			searchExpanded.value = false;
	}

	function keydown(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (search.value) clearSearch();
			else {
				searchExpanded.value = false;
				void nextTick(() =>
					root.value?.querySelector<HTMLButtonElement>('.workspace-quick-search-toggle')?.focus(),
				);
			}
			return;
		}
		const items = [
			...new Map(
				groups.value
					.filter((group) => search.value || !collapsed.value.has(group.name))
					.flatMap((group) => group.items)
					.map((item) => [item.id, item]),
			).values(),
		];
		if (!items.length) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const current = items.findIndex((item) => item.id === focusedId.value);
			const index =
				current < 0
					? event.key === 'ArrowDown'
						? 0
						: items.length - 1
					: (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
			focusedId.value = items[index].id;
			void nextTick(() => {
				const rows = root.value?.querySelectorAll<HTMLElement>('.workspace-quick-row.is-selected') ?? [];
				[...rows].find((row) => row.getClientRects().length)?.scrollIntoView({ block: 'nearest' });
			});
		} else if (event.key === 'Enter') {
			event.preventDefault();
			run(items.find((item) => item.id === focusedId.value) ?? items[0]);
		}
	}

	const contextItems = computed(() => [
		{ id: 'copy', label: t('tools.copyCommand'), icon: Copy },
		{
			id: 'run',
			label: t('tools.run'),
			icon: Play,
			disabled: !targets.list().some((target) => target.id === props.sessionId),
		},
		{ id: 'edit', label: t('tools.edit'), icon: Pencil },
		{ id: 'remove', label: t('remove'), icon: Trash2, tone: 'danger' as const },
		{ id: 'all', label: t('tools.sendToAll'), icon: Send, disabled: !targets.list().length },
	]);

	async function action(id: string, item: QuickCommand) {
		if (id === 'run' || id === 'all') run(item, id === 'all');
		else if (id === 'edit') edit(item);
		else if (id === 'remove') removing.value = item;
		else if (id === 'copy') {
			try {
				await clipboard.copy(item.command);
			} catch {
				props.ctx.app.log.report({
					level: 'error',
					code: 'WORKSPACE_COMMAND_COPY_FAILED',
					userVisible: true,
				});
			}
		}
	}
</script>
<template>
	<section
		ref="root"
		class="workspace-quick-commands"
		:aria-label="t('tools.commands')"
		:class="{ 'is-compact': compact }"
	>
		<header class="workspace-quick-controls" @focusout="blurSearch" @click="closeSearchAfterAction">
			<UiButton
				v-if="!searchExpanded"
				class="workspace-quick-search-toggle"
				appearance="ghost"
				icon-only
				:aria-label="t('tools.expandSearch')"
				:title="t('tools.expandSearch')"
				@click.stop="openSearch"
				><Search :size="15"
			/></UiButton>
			<div v-else class="workspace-quick-search">
				<UiInput
					v-model="search"
					type="search"
					:aria-label="t('tools.searchCommands')"
					:placeholder="t('tools.searchCommands')"
					@keydown="keydown"
				>
					<template #leading><Search :size="13" /></template>
					<template v-if="search" #trailing
						><UiButton
							class="workspace-quick-clear"
							appearance="ghost"
							icon-only
							:aria-label="t('tools.clearSearch')"
							:title="t('tools.clearSearch')"
							@pointerdown.prevent
							@click.stop="clearSearch"
							><X :size="12" /></UiButton
					></template>
				</UiInput>
			</div>
			<UiButton
				appearance="ghost"
				icon-only
				:aria-label="t('tools.sort') + ' · ' + sortLabel"
				:title="sortLabel"
				@click="cycleSort"
				><component :is="sortIcon" :size="15"
			/></UiButton>
			<UiButton
				appearance="ghost"
				icon-only
				:aria-label="t('tools.compactMode')"
				:title="t('tools.compactMode')"
				:aria-pressed="compact"
				@click="compact = !compact"
				><component :is="compact ? Minimize2 : Maximize2" :size="15"
			/></UiButton>
			<UiButton
				appearance="ghost"
				icon-only
				:aria-label="t(displayMode === 'name' ? 'tools.showCommand' : 'tools.showName')"
				:title="t(displayMode === 'name' ? 'tools.showCommand' : 'tools.showName')"
				@click="displayMode = displayMode === 'name' ? 'command' : 'name'"
				><component :is="displayMode === 'name' ? Tags : Terminal" :size="15"
			/></UiButton>
			<UiButton
				appearance="ghost"
				icon-only
				:aria-label="t('tools.newCommand')"
				:title="t('tools.newCommand')"
				:disabled="!catalog.loaded.value || catalog.busy.value"
				@click="edit()"
				><Plus :size="17"
			/></UiButton>
		</header>
		<div class="workspace-quick-list">
			<section v-for="group in groups" :key="group.name" class="workspace-quick-group">
				<button
					class="workspace-quick-group-heading"
					:aria-expanded="!!search || !collapsed.has(group.name)"
					@click="collapsed.has(group.name) ? collapsed.delete(group.name) : collapsed.add(group.name)"
				>
					<ChevronDown :size="13" :class="{ 'is-collapsed': !search && collapsed.has(group.name) }" /><Tags
						:size="13"
					/><span>{{ group.name || t('tools.untagged') }}</span
					><small>{{ group.items.length }}</small>
				</button>
				<div v-show="search || !collapsed.has(group.name)" class="workspace-quick-group-list">
					<UiContextMenu
						v-for="item in group.items"
						:key="item.id"
						:items="contextItems"
						:disabled="catalog.busy.value"
						@select="action($event, item)"
					>
						<button
							class="workspace-quick-row"
							:class="{ 'is-selected': focusedId === item.id }"
							:title="item.name + '\n' + item.command"
							:aria-label="t('tools.runNamed', { name: item.name })"
							:disabled="catalog.busy.value"
							@click="run(item)"
							@contextmenu="focusedId = item.id"
						>
							<span :class="{ 'is-code': displayMode !== 'name' }">{{
								displayMode === 'name' ? item.name : item.command
							}}</span><Play :size="12" />
						</button>
					</UiContextMenu>
				</div>
			</section>
			<UiEmptyState
				v-if="!groups.length && catalog.loaded.value"
				:title="t(search ? 'tools.noResults' : 'tools.noCommands')"
				:icon="Terminal"
			/>
		</div>
	</section>
	<UiDialog
		:open="editing"
		:title="t('tools.editCommand')"
		:close-label="t('cancel')"
		@update:open="editing = $event"
	>
		<div class="workspace-editor-form">
			<UiField :label="t('tools.name')"><UiInput v-model="name" :aria-label="t('tools.name')" /></UiField
			><UiField :label="t('tools.command')">
				<textarea
					v-model="command"
					class="workspace-code-input"
					:aria-label="t('tools.command')"
					spellcheck="false"
					rows="5"
				/>
			</UiField>
			<p class="workspace-form-hint">{{ t('tools.variablesHint', { example: '${name}' }) }}</p>
			<UiField :label="t('tools.tags')"
				><UiInput v-model="tags" :aria-label="t('tools.tags')" :placeholder="t('tools.tagsHint')" /></UiField
			><UiField v-for="key in commandVariables(command)" :key="key" :label="key"
				><UiInput v-model="variables[key]" :aria-label="key"
			/></UiField>
		</div>
		<template #footer
			><UiButton @click="editing = false">{{ t('cancel') }}</UiButton
			><UiButton
				tone="primary"
				:loading="catalog.busy.value"
				:disabled="!CommandInputSchema.safeParse(draft).success"
				@click="save"
				>{{ t('tools.save') }}</UiButton
			></template
		>
	</UiDialog>
	<UiDialog
		:open="!!executing"
		:title="executing?.name ?? t('tools.commands')"
		:close-label="t('cancel')"
		@update:open="!$event && (executing = undefined)"
	>
		<div class="workspace-editor-form">
			<div class="workspace-command-tags">
				<span v-for="target in recipients" :key="target.id">{{ target.name }}</span>
			</div>
			<UiField v-for="key in commandVariables(executing?.command ?? '')" :key="key" :label="key"
				><UiInput v-model="values[key]" :aria-label="key"
			/></UiField>
			<pre class="workspace-command-preview">{{ expanded }}</pre>
		</div>
		<template #footer
			><UiButton @click="executing = undefined">{{ t('cancel') }}</UiButton
			><UiButton
				tone="primary"
				:loading="catalog.busy.value"
				:disabled="
					expanded.length > 32766 ||
					commandVariables(executing?.command ?? '').some((key) => values[key] === undefined)
				"
				@click="
					executing &&
					send(
						executing,
						expanded,
						recipients.map((item) => item.id),
					)
				"
				><Play :size="16" />{{ t('tools.run') }}</UiButton
			></template
		>
	</UiDialog>

	<UiDialog
		:open="!!removing"
		:title="t('tools.removeCommand')"
		:description="t('tools.removeCommandHint', { name: removing?.name ?? '' })"
		:close-label="t('cancel')"
		@update:open="!$event && !catalog.busy.value && (removing = undefined)"
	>
		<template #footer
			><UiButton :disabled="catalog.busy.value" @click="removing = undefined">{{ t('cancel') }}</UiButton
			><UiButton
				tone="danger"
				:loading="catalog.busy.value"
				@click="
					async () => {
						if (removing && (await catalog.remove('commands', removing))) removing = undefined;
					}
				"
				>{{ t('remove') }}</UiButton
			></template
		>
	</UiDialog>
</template>
<style scoped>
	.workspace-quick-commands {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		height: 100%;
		overflow: hidden;
		background: var(--ui-surface);
		container: quick-commands / inline-size;
	}
	.workspace-quick-controls {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		padding: 6px;
		border-bottom: 1px solid var(--ui-border);
	}
	.workspace-quick-search {
		display: flex;
		flex: 1;
		min-width: 0;
		width: 0;
	}
	.workspace-quick-search :deep(.ui-input) {
		flex: 1;
		gap: 4px;
		height: 28px;
		min-height: 28px;
		padding: 4px 8px;
		font-size: 11px;
	}
	.workspace-quick-controls :deep(input) {
		font-size: 12px;
		padding-block: 3px;
	}
	.workspace-quick-controls > .ui-button {
		flex: none;
		--ui-button-height: 28px;
		min-width: 28px;
		width: 28px;
		padding: 5px;
	}
	.workspace-quick-controls [aria-pressed='true'] {
		color: var(--ui-primary);
		background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
	}
	.workspace-quick-clear {
		--ui-button-height: 18px;
		min-width: 18px;
		width: 18px;
		padding: 2px;
	}
	.workspace-quick-search :deep(input::-webkit-search-cancel-button) {
		display: none;
	}
	.workspace-quick-list {
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		padding: 8px;
	}
	.workspace-quick-group {
		border: 1px solid var(--ui-border);
		border-radius: 9px;
		overflow: hidden;
		margin-bottom: 8px;
	}
	.workspace-quick-group-heading {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		min-height: 34px;
		padding: 5px 8px;
		border: 0;
		background: color-mix(in srgb, var(--ui-primary) 5%, var(--ui-surface));
		color: var(--ui-text);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}
	.workspace-quick-group-heading > span {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.workspace-quick-group-heading > svg {
		flex: none;
		color: var(--ui-muted);
	}
	.workspace-quick-group-heading .is-collapsed {
		transform: rotate(-90deg);
	}
	.workspace-quick-group-heading > small {
		flex: none;
		display: grid;
		place-items: center;
		min-width: 20px;
		height: 20px;
		padding: 0 5px;
		border-radius: 7px;
		background: color-mix(in srgb, var(--ui-text) 6%, transparent);
		color: var(--ui-muted);
		font-size: 10px;
		font-variant-numeric: tabular-nums;
	}
	.workspace-quick-group-list {
		padding: 3px;
	}
	.workspace-quick-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 30px;
		padding: 5px 8px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--ui-text);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}
	.workspace-quick-row > span {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.workspace-quick-row > .is-code {
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}
	.workspace-quick-row > svg {
		flex: none;
		color: var(--ui-primary);
		opacity: 0;
	}
	.workspace-quick-row:hover,
	.workspace-quick-row.is-selected {
		background: color-mix(in srgb, var(--ui-primary) 10%, transparent);
	}
	.workspace-quick-row:focus-visible {
		outline: 2px solid var(--ui-primary);
		outline-offset: -2px;
	}
	.workspace-quick-row:hover > svg,
	.workspace-quick-row:focus-visible > svg {
		opacity: 1;
	}
	.workspace-quick-row:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.is-compact .workspace-quick-row {
		min-height: 24px;
		padding-block: 3px;
	}
	.is-compact .workspace-quick-group-heading {
		min-height: 28px;
		padding-block: 3px;
	}
	@container quick-commands (max-width: 270px) {
		.workspace-quick-list {
			padding: 6px;
		}
	}

	@media (hover: none) {
		.workspace-quick-row > svg {
			opacity: 0.6;
		}
	}
</style>
