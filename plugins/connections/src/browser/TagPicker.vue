<script setup lang="ts">
	import { useI18n } from 'vue-i18n';
	import { computed, ref, watchEffect, onMounted } from 'vue';
	import {
		ComboboxRoot,
		ComboboxAnchor,
		ComboboxInput,
		ComboboxTrigger,
		ComboboxContent,
		ComboboxViewport,
		ComboboxPortal,
		ComboboxItem,
		ComboboxItemIndicator,
	} from 'reka-ui';
	import { Check, ChevronDown, Plus, Trash2, X } from '@lucide/vue';
	import { UiButton, UiDialog } from 'nexus-terminal/browser/ui';
	import type { PluginWindowApi } from 'nexus-terminal/browser';
	import type { Tag } from '../shared/connection-types';
	import { useConnections } from './connections-view.js';
	const selected = defineModel<string[]>({ required: true });
	const props = defineProps<{
		tags: Tag[];
		inputId: string;
		inputDescribedBy?: string;
		disabled?: boolean;
		signal: AbortSignal;
		view: PluginWindowApi;
	}>();
	const emit = defineEmits<{
		deleted: [id: string, name: string];
		overlayChange: [open: boolean];
	}>();
	const { t } = useI18n({ useScope: 'parent' });
	const client = useConnections();
	const query = ref(''),
		open = ref(false),
		pending = ref<Tag>(),
		deleting = ref(false);
	watchEffect(() => emit('overlayChange', open.value || !!pending.value));
	const container = ref<HTMLElement>();
	const portalTarget = ref<HTMLElement>();
	onMounted(() => {
		portalTarget.value = container.value?.closest<HTMLElement>('[role=dialog]') ?? document.body;
	});

	const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();

	const choices = computed(() => {
		const saved = new Map(props.tags.map((tag) => [tag.name, tag]));
		return [...new Set([...saved.keys(), ...selected.value])]
			.filter((name) => normalize(name).includes(normalize(query.value)))
			.map((name) => ({ name, tag: saved.get(name) }));
	});
	const create = computed(
		() =>
			query.value.trim().length > 0 &&
			query.value.trim().length <= 40 &&
			![...props.tags.map((tag) => tag.name), ...selected.value].some(
				(name) => normalize(name) === normalize(query.value),
			),
	);

	function updated() {
		query.value = '';
		open.value = false;
	}

	function confirmDelete(tag: Tag) {
		open.value = false;
		pending.value = tag;
	}

	async function remove() {
		if (!pending.value || deleting.value) return;
		const tag = pending.value;
		deleting.value = true;
		try {
			await client.removeTag(tag.id, props.view);
			if (props.signal.aborted) return;
			selected.value = selected.value.filter((name) => name !== tag.name);
			pending.value = undefined;
			emit('deleted', tag.id, tag.name);
		} catch (cause) {
			client.report(cause, props.signal);
		} finally {
			deleting.value = false;
		}
	}
</script>
<template>
	<div ref="container" class="connections-tag-picker">
		<div v-if="selected.length" class="connections-tag-selection">
			<span v-for="name in selected" :key="name" class="connections-tag"
				>{{ name
				}}<button
					type="button"
					:disabled="disabled"
					:aria-label="t('detachTag', { name })"
					@click="selected = selected.filter((value) => value !== name)"
				>
					<X :size="12" /></button
			></span>
		</div>
		<ComboboxRoot
			v-model="selected"
			v-model:open="open"
			multiple
			:ignore-filter="true"
			:disabled="disabled"
			@update:model-value="updated"
		>
			<ComboboxAnchor class="connections-tag-anchor">
				<ComboboxInput
					v-model="query"
					:id="inputId"
					:aria-describedby="inputDescribedBy"
					class="connections-tag-input"
					:placeholder="t('tagPlaceholder')"
					:maxlength="40"
					@click="open = true"
				/>
				<ComboboxTrigger :aria-label="t('tags')"><ChevronDown :size="16" /></ComboboxTrigger>
			</ComboboxAnchor>
			<ComboboxPortal :to="portalTarget" :disabled="!portalTarget">
				<ComboboxContent
					v-if="choices.length || create"
					class="connections-tag-dropdown"
					position="popper"
					align="start"
					:side-offset="6"
					:collision-padding="12"
					@escape-key-down="
						(event) => {
							event.preventDefault();
							open = false;
						}
					"
				>
					<ComboboxViewport>
						<div v-for="{ name, tag } in choices" :key="name" class="connections-tag-option-row">
							<ComboboxItem :value="name" class="connections-tag-option"
								><span>{{ name }}</span
								><ComboboxItemIndicator><Check :size="14" /></ComboboxItemIndicator
							></ComboboxItem>
							<UiButton
								v-if="tag"
								type="button"
								class="connections-tag-delete"
								appearance="ghost"
								density="compact"
								icon-only
								:aria-label="t('removeTag', { name })"
								:title="t('removeTag', { name })"
								@pointerdown.stop.prevent
								@click.stop="confirmDelete(tag)"
								><Trash2 :size="14"
							/></UiButton>
						</div>
						<ComboboxItem
							v-if="create"
							:value="query.trim()"
							class="connections-tag-option connections-tag-create"
							><Plus :size="15" />{{ t('createTag', { name: query.trim() }) }}</ComboboxItem
						>
					</ComboboxViewport>
				</ComboboxContent>
			</ComboboxPortal>
		</ComboboxRoot>
	</div>
	<UiDialog
		:open="!!pending"
		:title="t('tagDeleteTitle')"
		:description="pending ? t('tagDeleteDescription', { name: pending.name, count: pending.count }) : ''"
		:close-label="t('close')"
		size="sm"
		:close-on-interact-outside="!deleting"
		:close-on-escape="!deleting"
		:show-close="!deleting"
		@update:open="
			(value) => {
				if (!value && !deleting) pending = undefined;
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
