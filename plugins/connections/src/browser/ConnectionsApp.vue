<script setup lang="ts">
	import { useI18n } from 'vue-i18n';
	import { computed, onMounted, ref, watch, watchEffect, type Ref } from 'vue';
	import { messages } from './messages.js';
	import {
		Server,
		Terminal,
		Monitor,
		ScreenShare,
		Search,
		Plus,
		RefreshCw,
		Ellipsis,
		Copy,
		Trash2,
	} from '@lucide/vue';
	import {
		UiInput,
		UiButton,
		UiSelect,
		UiBadge,
		UiCard,
		UiEmptyState,
		UiDialog,
		UiDropdownMenu,
	} from 'nexus-terminal/browser/ui';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import { ConnectionTypeSchema, type Connection, type ConnectionEditorRequest } from '../shared/connection-types';
	import { useConnections } from './connections-view.js';
	import { connectionAddress as address } from './connection-presentation';
	import ConnectionEditor from './ConnectionEditor.vue';
	const props = defineProps<PluginWindowProps & { label: Ref<string> }>();
	const { t } = useI18n({ useScope: 'local', messages });
	watchEffect(() => (props.label.value = t('title')));
	const client = useConnections();
	const { catalog, loaded, requests } = client;
	const loading = computed(() => requests.value > 0);
	const { signal } = props.view;

	async function refresh() {
		try {
			await client.refresh(signal);
		} catch (cause) {
			client.report(cause, signal);
		}
	}

	const search = ref(''),
		type = ref('all'),
		selectedTag = ref('all'),
		editor = ref<{
			connection?: Connection;
			duplicate?: boolean;
			reason?: ConnectionEditorRequest['reason'];
		}>(),
		pending = ref<Connection>(),
		deleting = ref(false);

	watch(
		[client.editorRequest, editor, () => props.view.state.value.focused],
		([request, current, focused]) => {
			if (!request || !focused) return;
			// 另一个编辑器已有草稿时，把导航请求留到该草稿关闭后。
			if (current && (current.duplicate || current.connection?.id !== request.connectionId)) return;

			const connection = catalog.value.connections.find(({ id }) => id === request.connectionId);
			client.clearEditorRequest(request);
			if (connection)
				editor.value = current
					? { ...current, reason: request.reason }
					: { connection, reason: request.reason };
		},
		{ immediate: true },
	);

	const tag = computed({
		get: () => (catalog.value.tags.some((item) => item.id === selectedTag.value) ? selectedTag.value : 'all'),

		set: (value: string) => {
			selectedTag.value = value;
		},
	});
	const typeOptions = computed(() => [
		{ value: 'all', label: t('allTypes') },
		...ConnectionTypeSchema.options.map((value) => ({ value, label: t('types.' + value) })),
	]);
	const tagOptions = computed(() => [
		{ value: 'all', label: t('allTags') },
		...catalog.value.tags.map((tag) => ({ value: tag.id, label: tag.name })),
	]);
	const entries = computed(() => {
		const query = search.value.trim().toLowerCase();
		const name = catalog.value.tags.find((item) => item.id === tag.value)?.name;
		return catalog.value.connections.filter(
			(item) =>
				(type.value === 'all' || item.type === type.value) &&
				(!name || item.tags.includes(name)) &&
				(!query || [item.name, item.host, item.username].some((value) => value.toLowerCase().includes(query))),
		);
	});
	const actions = computed(() => [
		{ id: 'duplicate', label: t('duplicate'), icon: Copy },
		{ id: 'delete', label: t('delete'), icon: Trash2, tone: 'danger' as const },
	]);

	function selectAction(action: string, item: Connection) {
		if (action === 'duplicate') editor.value = { connection: item, duplicate: true };
		else if (action === 'delete') pending.value = item;
	}

	const icons = { ssh: Terminal, rdp: Monitor, vnc: ScreenShare };
	onMounted(refresh);

	async function saved() {
		editor.value = undefined;
		await refresh();
	}

	async function remove() {
		if (!pending.value || deleting.value || signal.aborted) return;
		deleting.value = true;
		try {
			const id = pending.value.id;
			await client.remove(id, props.view);
			if (signal.aborted) return;
			pending.value = undefined;
			await refresh();
		} catch (cause) {
			client.report(cause, signal);
		} finally {
			deleting.value = false;
		}
	}
</script>
<template>
	<section class="connections-app" :aria-label="t('title')" data-ui-selection="none">
		<header class="connections-toolbar">
			<div class="connections-search">
				<UiInput v-model="search" :placeholder="t('search')" :aria-label="t('search')"
					><template #leading><Search :size="17" /></template
				></UiInput>
			</div>
			<div class="connections-filters">
				<UiSelect v-model="type" :options="typeOptions" :aria-label="t('type')" /><UiSelect
					v-model="tag"
					:options="tagOptions"
					:aria-label="t('tags')"
				/>
			</div>
			<div class="connections-toolbar-actions">
				<UiButton tone="primary" @click="editor = {}"><Plus :size="17" />{{ t('add') }}</UiButton>
				<UiButton
					appearance="ghost"
					icon-only
					:loading="loading"
					loading-animation="icon"
					:aria-label="t('refresh')"
					@click="refresh"
					><RefreshCw :size="17"
				/></UiButton>
			</div>
		</header>
		<div class="connections-list" :aria-busy="loading">
			<UiCard
				v-for="item in entries"
				:key="item.id"
				class="connections-card"
				:data-type="item.type"
				:title="item.name"
				:description="address(item)"
				:icon="icons[item.type]"
				:tone="item.type === 'ssh' ? 'primary' : item.type === 'rdp' ? 'success' : 'neutral'"
				@select="editor = { connection: item }"
			>
				<template v-if="item.tags.length" #tags
					><span v-for="name in item.tags" :key="name" class="connections-tag">{{ name }}</span></template
				>
				<template #badge
					><UiBadge :tone="item.type === 'ssh' ? 'primary' : item.type === 'rdp' ? 'success' : 'neutral'">{{
						t('types.' + item.type)
					}}</UiBadge></template
				>
				<template #actions>
					<UiDropdownMenu :items="actions" @select="selectAction($event, item)">
						<UiButton appearance="ghost" icon-only :aria-label="t('actions') + ' · ' + item.name"
							><Ellipsis :size="19"
						/></UiButton>
					</UiDropdownMenu>
				</template>
			</UiCard>
			<UiEmptyState
				v-if="loaded && !entries.length"
				:icon="Server"
				:title="t(catalog.connections.length ? 'noResults' : 'empty')"
				:description="t(catalog.connections.length ? 'noResultsHint' : 'emptyHint')"
			/>
		</div>
	</section>
	<ConnectionEditor
		v-if="editor"
		:key="editor.connection?.id ?? 'new'"
		:connection="editor.connection"
		:duplicate="editor.duplicate"
		:reason="editor.reason"
		:signal="signal"
		:view="view"
		@close="editor = undefined"
		@saved="saved"
	/>
	<UiDialog
		:open="!!pending"
		:title="t('deleteTitle')"
		:description="pending ? t('deleteDescription', { name: pending.name }) : ''"
		:close-label="t('close')"
		size="sm"
		:close-disabled="deleting"
		@update:open="
			(value) => {
				if (!value) pending = undefined;
			}
		"
	>
		<template #footer
			><UiButton :disabled="deleting" @click="pending = undefined">{{ t('cancel') }}</UiButton
			><UiButton tone="danger" :loading="deleting" loading-animation="spinner" @click="remove">{{
				t('delete')
			}}</UiButton></template
		>
	</UiDialog>
</template>
