<script setup lang="ts">
	import { computed, nextTick, onScopeDispose, ref, useId, watch } from 'vue';
	import { useClipboard } from '@vueuse/core';
	import { ChevronDown, Copy, Folder, Trash2 } from '@lucide/vue';
	import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui';
	import { UiButton, UiContextMenu, UiInput } from 'nexus-terminal/browser/ui';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import { WorkspacePathHistorySchema } from '../../shared/workspace-path-history-types';
	import { createWorkspaceClient } from '../workspace-client';
	import type { WorkspaceI18n } from '../workspace-i18n';

	const props = defineProps<{
		ctx: PluginContextApi;
		signal: AbortSignal;
		i18n: WorkspaceI18n;
		path: string;
		loaded: boolean;
		enabled: boolean;
		navigate(path: string): Promise<string | undefined>;
	}>();
	const { t } = props.i18n;
	const { copy } = useClipboard({ legacy: true });
	const client = createWorkspaceClient(props.ctx, props.ctx.signal);
	const draft = ref(props.path);
	const open = ref(false);
	const anchor = ref<HTMLFormElement>();
	const history = ref<string[]>([]);
	const loading = ref(false);
	const failed = ref(false);
	const selected = ref(-1);
	const contextPath = ref<string>();
	const listId = useId();
	let read: AbortController | undefined;
	let writes = Promise.resolve();

	const filtered = computed(() => {
		const query = draft.value === props.path ? '' : draft.value.trim().toLowerCase();
		return query ? history.value.filter((path) => path.toLowerCase().includes(query)) : history.value;
	});

	function write(method: 'POST' | 'DELETE', path: string): Promise<void> {
		const operation = writes.then(async () => {
			if (method === 'POST') await client.request('path-history', method, { path });
			else await client.request('path-history?' + new URLSearchParams({ path }), method);
		});
		writes = operation.catch(() => undefined);
		return operation;
	}

	watch(
		() => props.path,
		(path, previous) => {
			if (!open.value || draft.value === previous) draft.value = path;
		},
	);
	watch(
		() => (props.loaded ? props.path : undefined),
		(path) => {
			if (path) void write('POST', path).catch(() => undefined);
		},
		{ immediate: true },
	);
	watch(
		() => props.enabled,
		(enabled) => {
			if (!enabled) open.value = false;
		},
	);
	watch(filtered, () => (selected.value = -1));

	watch(
		open,
		(visible) => {
			selected.value = -1;
			if (visible) void refresh();
			else read?.abort();
		},
		{ flush: 'sync' },
	);
	onScopeDispose(() => read?.abort());

	async function refresh(): Promise<void> {
		read?.abort();
		const request = new AbortController();
		read = request;
		const signal = AbortSignal.any([props.signal, request.signal, props.ctx.signal]);
		loading.value = true;
		failed.value = false;
		try {
			await writes;
			signal.throwIfAborted();
			const reader = createWorkspaceClient(props.ctx, signal);
			const { paths } = await reader.request('path-history', undefined, undefined, WorkspacePathHistorySchema);
			if (!signal.aborted) history.value = paths;
		} catch {
			if (!signal.aborted) failed.value = true;
		} finally {
			if (read === request) loading.value = false;
		}
	}

	function choose(path = filtered.value[selected.value] ?? draft.value): void {
		if (!props.enabled || !path.trim()) return;
		open.value = false;
		const typed = draft.value;
		void props.navigate(path).then((resolved) => {
			if (resolved !== undefined && !props.signal.aborted && draft.value === typed) draft.value = resolved;
		});
	}

	function onKey(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === 'Escape' && (open.value || draft.value !== props.path)) {
			event.preventDefault();
			event.stopPropagation();
			open.value = false;
			draft.value = props.path;
			return;
		}
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		event.stopPropagation();
		open.value = true;
		const length = filtered.value.length;
		if (!length) return;
		const step = event.key === 'ArrowDown' ? 1 : -1;
		const start = selected.value < 0 && step < 0 ? 0 : selected.value;
		selected.value = (start + step + length) % length;
		void nextTick(() =>
			document.getElementById(listId + '-' + selected.value)?.scrollIntoView({ block: 'nearest' }),
		);
	}

	function onOutside(event: Event): void {
		const target = event.target;
		if (target instanceof Element && (anchor.value?.contains(target) || target.closest('[data-ui="context-menu"]')))
			event.preventDefault();
	}

	async function historyAction(action: string): Promise<void> {
		const path = contextPath.value;
		if (!path) return;
		try {
			if (action === 'copy') await copy(path);
			else if (action === 'remove') {
				await write('DELETE', path);
				if (props.signal.aborted) return;
				history.value = history.value.filter((item) => item !== path);
				if (open.value) void refresh();
			}
		} catch (cause) {
			if (!props.signal.aborted) client.report(cause);
		}
	}
</script>

<template>
	<PopoverRoot v-model:open="open">
		<form ref="anchor" class="workspace-file-path" @submit.prevent="choose()">
			<PopoverAnchor as-child>
				<div class="workspace-path-field">
					<UiInput
						v-model="draft"
						:aria-label="t('path')"
						:disabled="!enabled"
						:aria-expanded="open"
						:aria-controls="open ? listId : undefined"
						:aria-activedescendant="open && selected >= 0 ? listId + '-' + selected : undefined"
						role="combobox"
						aria-autocomplete="list"
						autocomplete="off"
						spellcheck="false"
						@focus="open = true"
						@click="open = true"
						@update:model-value="open = true"
						@keydown="onKey"
					>
						<template #leading><Folder :size="15" aria-hidden="true" /></template>
						<template #trailing>
							<UiButton
								type="button"
								class="path-history-toggle"
								appearance="ghost"
								density="compact"
								icon-only
								:aria-label="t('pathHistory.title')"
								:title="t('pathHistory.title')"
								:aria-expanded="open"
								:disabled="!enabled"
								@mousedown.prevent
								@click="open = !open"
								><ChevronDown :size="16" aria-hidden="true"
							/></UiButton>
						</template>
					</UiInput>
				</div>
			</PopoverAnchor>
		</form>
		<PopoverPortal :to="anchor?.closest('[role=dialog]') ?? 'body'">
			<PopoverContent
				as-child
				align="start"
				:side-offset="4"
				:collision-padding="8"
				@open-auto-focus.prevent
				@close-auto-focus.prevent
				@interact-outside="onOutside"
			>
				<div class="workspace-path-history">
					<UiContextMenu
						:items="[
							{ id: 'copy', label: t('copyPath'), icon: Copy },
							{ id: 'remove', label: t('pathHistory.remove'), icon: Trash2, tone: 'danger' },
						]"
						@select="historyAction"
					>
						<div
							:id="listId"
							role="listbox"
							tabindex="-1"
							:aria-label="t('pathHistory.title')"
							:aria-busy="loading"
							@contextmenu.self.stop.prevent
						>
							<button
								v-for="(path, index) in filtered"
								:key="path"
								:id="listId + '-' + index"
								class="path-history-option"
								type="button"
								role="option"
								tabindex="-1"
								:aria-selected="selected === index"
								:title="path"
								@mousedown.left.prevent
								@pointerdown="contextPath = path"
								@contextmenu="contextPath = path"
								@click="choose(path)"
							>
								{{ path }}
							</button>
						</div>
					</UiContextMenu>
					<p v-if="!filtered.length" class="path-history-message" role="status">
						{{ t(loading ? 'pathHistory.loading' : failed ? 'pathHistory.failed' : 'pathHistory.empty') }}
					</p>
				</div>
			</PopoverContent>
		</PopoverPortal>
	</PopoverRoot>
</template>

<style scoped>
	.path-history-toggle {
		--ui-button-height: 24px;
		width: 26px;
		min-width: 26px;
		padding: 0;
	}

	.workspace-path-field {
		display: flex;
		flex: 1;
		min-width: 0;
	}

	.workspace-path-history {
		z-index: 105;
		box-sizing: border-box;
		width: max-content;
		min-width: min(var(--reka-popover-trigger-width), var(--reka-popover-content-available-width));
		max-width: var(--reka-popover-content-available-width);
		max-height: min(280px, var(--reka-popover-content-available-height));
		overflow: auto;
		padding: 4px;
		border: 1px solid var(--ui-border);
		border-radius: 9px;
		background: var(--ui-surface);
		color: var(--ui-text);
		box-shadow: 0 8px 24px #0002;
	}

	.path-history-option {
		display: block;
		width: 100%;
		padding: 7px 8px;
		overflow: hidden;
		border: 0;
		border-radius: 5px;
		background: transparent;
		color: inherit;
		font:
			12px ui-monospace,
			monospace;
		text-align: start;
		text-overflow: ellipsis;
		white-space: nowrap;
		cursor: pointer;
	}

	.path-history-option:hover,
	.path-history-option:focus-visible,
	.path-history-option[aria-selected='true'] {
		background: color-mix(in srgb, var(--ui-primary) 12%, transparent);
	}

	.path-history-message {
		margin: 0;
		padding: 7px 8px;
		color: var(--ui-muted);
		font-size: 12px;
	}
</style>
