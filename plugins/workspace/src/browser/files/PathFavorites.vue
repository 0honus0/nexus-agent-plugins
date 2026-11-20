<script setup lang="ts">
	import { computed, ref } from 'vue';
	import { Star, Plus, Pencil, Trash2, FolderHeart, FolderOpen, Settings2 } from '@lucide/vue';
	import {
		UiButton,
		UiInput,
		UiDialog,
		UiField,
		UiEmptyState,
		UiDropdownMenu,
		type UiMenuItem,
	} from 'nexus-terminal/browser/ui';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import { FavoriteInputSchema, type Favorite } from '../../shared/workspace-catalog-types';
	import { useWorkspaceCatalog } from '../catalog/workspace-catalog';
	const props = defineProps<{ path: string; enabled: boolean; i18n: WorkspaceI18n }>();
	const emit = defineEmits<{ navigate: [path: string] }>();
	const { t } = props.i18n;
	const catalog = useWorkspaceCatalog();
	const open = ref(false),
		editing = ref(false),
		saving = ref(false),
		search = ref(''),
		name = ref(''),
		remote = ref('');
	const selected = ref<Favorite>();
	const items = computed(() =>
		catalog.state.value.favorites.filter((item) =>
			(item.name + item.path).toLowerCase().includes(search.value.toLowerCase()),
		),
	);
	const favorites = computed(() => catalog.state.value.favorites);
	const starred = computed(() => favorites.value.some((item) => item.path === props.path));
	const menuItems = computed<UiMenuItem[]>(() => [
		...favorites.value.map((item) => ({
			id: 'favorite:' + item.id,
			label: item.name,
			icon: item.path === props.path ? Star : FolderOpen,
		})),
		{
			id: 'save',
			label: t('tools.savePath'),
			icon: Plus,
			separatorBefore: favorites.value.length > 0,
		},
		{ id: 'manage', label: t('tools.manageFavorites'), icon: Settings2 },
	]);

	function select(id: string) {
		if (id === 'save') edit();
		else if (id === 'manage') open.value = true;
		else {
			const favorite = favorites.value.find((item) => 'favorite:' + item.id === id);
			if (favorite) emit('navigate', favorite.path);
		}
	}

	function edit(item?: Favorite) {
		item ??= catalog.state.value.favorites.find((value) => value.path === props.path);
		selected.value = item;
		name.value = item?.name ?? props.path.split('/').filter(Boolean).at(-1) ?? '/';
		remote.value = item?.path ?? props.path;
		editing.value = true;
	}

	async function save() {
		const input = FavoriteInputSchema.safeParse({ name: name.value, path: remote.value });
		if (!input.success || saving.value) return;
		saving.value = true;
		try {
			if (!catalog.loaded.value) await catalog.refresh();
			if (!catalog.loaded.value || !editing.value) return;
			const item = selected.value ?? favorites.value.find((favorite) => favorite.path === input.data.path);
			if (await catalog.save('favorites', input.data, item)) editing.value = false;
		} finally {
			saving.value = false;
		}
	}
</script>
<template>
	<UiDropdownMenu :items="menuItems" :disabled="!enabled" align="start" @select="select">
		<UiButton
			type="button"
			appearance="ghost"
			icon-only
			:aria-label="t('tools.favorites')"
			:title="t('tools.favorites')"
			:tone="starred ? 'primary' : 'neutral'"
			:disabled="!enabled"
			><Star :size="16" :fill="starred ? 'currentColor' : 'none'"
		/></UiButton>
	</UiDropdownMenu>
	<UiDialog :open="open" :title="t('tools.favorites')" :close-label="t('close')" @update:open="open = $event">
		<div class="workspace-library">
			<div class="workspace-library-toolbar">
				<UiInput
					v-model="search"
					:placeholder="t('tools.searchFavorites')"
					:aria-label="t('tools.searchFavorites')"
				/><UiButton @click="edit()"><Plus :size="16" />{{ t('tools.savePath') }}</UiButton>
			</div>
			<div class="workspace-library-list">
				<article v-for="item in items" :key="item.id" class="workspace-library-row">
					<button
						class="workspace-library-main"
						@click="
							emit('navigate', item.path);
							open = false;
						"
					>
						<span class="workspace-library-symbol"><FolderHeart :size="20" /></span
						><span
							><strong>{{ item.name }}</strong
							><code>{{ item.path }}</code></span
						>
					</button>
					<UiButton
						appearance="ghost"
						icon-only
						:aria-label="t('tools.editNamed', { name: item.name })"
						:disabled="catalog.busy.value"
						@click="edit(item)"
						><Pencil :size="15"
					/></UiButton>
					<UiButton
						appearance="ghost"
						icon-only
						:aria-label="t('tools.removeNamed', { name: item.name })"
						:disabled="catalog.busy.value"
						@click="catalog.remove('favorites', item)"
						><Trash2 :size="15"
					/></UiButton>
				</article>
				<UiEmptyState
					v-if="!items.length && catalog.loaded.value"
					:icon="FolderOpen"
					:title="t('tools.noFavorites')"
				/>
			</div>
		</div>
	</UiDialog>
	<UiDialog
		:open="editing"
		:title="t('tools.editFavorite')"
		:close-label="t('cancel')"
		@update:open="!saving && (editing = $event)"
	>
		<div class="workspace-editor-form">
			<UiField :label="t('tools.name')" v-slot="field"
				><UiInput v-model="name" :id="field.id" :disabled="saving" /></UiField
			><UiField :label="t('path')" v-slot="field"
				><UiInput v-model="remote" :id="field.id" :disabled="saving"
			/></UiField>
		</div>
		<template #footer
			><UiButton :disabled="saving" @click="editing = false">{{ t('cancel') }}</UiButton
			><UiButton
				tone="primary"
				:loading="saving"
				:disabled="!FavoriteInputSchema.safeParse({ name, path: remote }).success"
				@click="save"
				>{{ t('tools.save') }}</UiButton
			></template
		>
	</UiDialog>
</template>
