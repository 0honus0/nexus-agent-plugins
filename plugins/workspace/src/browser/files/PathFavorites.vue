<script setup lang="ts">
	import { computed, ref } from 'vue';
	import { Star, Plus, Pencil, Trash2, FolderHeart, Search, FolderOpen } from '@lucide/vue';
	import { UiButton, UiInput, UiDialog, UiField, UiEmptyState } from 'nexus-terminal/browser/ui';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import { FavoriteInputSchema, type Favorite } from '../../shared/workspace-catalog-types';
	import { useWorkspaceCatalog } from '../catalog/workspace-catalog';
	const props = defineProps<{ path: string; enabled: boolean; i18n: WorkspaceI18n }>();
	const emit = defineEmits<{ navigate: [path: string] }>();
	const { t } = props.i18n;
	const catalog = useWorkspaceCatalog();
	const open = ref(false),
		editing = ref(false),
		search = ref(''),
		name = ref(''),
		remote = ref('');
	const selected = ref<Favorite>();
	const items = computed(() =>
		catalog.state.value.favorites.filter((item) =>
			(item.name + item.path).toLowerCase().includes(search.value.toLowerCase()),
		),
	);
	const starred = computed(() => catalog.state.value.favorites.some((item) => item.path === props.path));

	function edit(item?: Favorite) {
		item ??= catalog.state.value.favorites.find((value) => value.path === props.path);
		selected.value = item;
		name.value = item?.name ?? props.path.split('/').filter(Boolean).at(-1) ?? '/';
		remote.value = item?.path ?? props.path;
		editing.value = true;
	}

	async function save() {
		if (await catalog.save('favorites', { name: name.value, path: remote.value }, selected.value))
			editing.value = false;
	}
</script>
<template>
	<UiButton
		type="button"
		appearance="ghost"
		icon-only
		:aria-label="t('tools.favorites')"
		:aria-pressed="starred"
		:tone="starred ? 'primary' : 'neutral'"
		:disabled="!enabled"
		@click="open = true"
		><Star :size="16"
	/></UiButton>
	<UiDialog :open="open" :title="t('tools.favorites')" :close-label="t('close')" @update:open="open = $event">
		<div class="workspace-library">
			<div class="workspace-library-toolbar">
				<UiInput
					v-model="search"
					:placeholder="t('tools.searchFavorites')"
					:aria-label="t('tools.searchFavorites')"
				/><UiButton :disabled="!catalog.loaded.value || catalog.busy.value" @click="edit()"
					><Plus :size="16" />{{ t('tools.savePath') }}</UiButton
				>
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
		@update:open="editing = $event"
	>
		<div class="workspace-editor-form">
			<UiField :label="t('tools.name')"><UiInput v-model="name" :aria-label="t('tools.name')" /></UiField
			><UiField :label="t('path')"><UiInput v-model="remote" :aria-label="t('path')" /></UiField>
		</div>
		<template #footer
			><UiButton @click="editing = false">{{ t('cancel') }}</UiButton
			><UiButton
				tone="primary"
				:loading="catalog.busy.value"
				:disabled="!FavoriteInputSchema.safeParse({ name, path: remote }).success"
				@click="save"
				>{{ t('tools.save') }}</UiButton
			></template
		>
	</UiDialog>
</template>
