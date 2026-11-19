<script setup lang="ts">
	import { useI18n } from 'vue-i18n';

	import { computed, ref, useId, watch } from 'vue';
	import type { PluginWindowApi } from 'nexus-terminal/browser';
	import { UiDialog, UiButton, UiInput, UiSelect, UiField } from 'nexus-terminal/browser/ui';
	import { Save } from '@lucide/vue';
	import {
		ConnectionInputSchema,
		ConnectionTypeSchema,
		connectionDefaults,
		type Connection,
		type ConnectionType,
		type ConnectionEditorRequest,
	} from '../shared/connection-types';
	import { useConnections } from './connections-view.js';
	import TagPicker from './TagPicker.vue';
	const props = defineProps<{
		connection?: Connection;
		duplicate?: boolean;
		reason?: ConnectionEditorRequest['reason'];
		signal: AbortSignal;
		view: PluginWindowApi;
	}>();
	const emit = defineEmits<{ close: []; saved: [] }>();
	const { t } = useI18n({ useScope: 'parent' });
	const client = useConnections();
	const { catalog, credentials } = client;
	const defaults = props.connection;
	const draft = ref({
		name: defaults ? (props.duplicate ? t('copyName', { name: defaults.name }) : defaults.name) : '',
		type: defaults?.type ?? ('ssh' as ConnectionType),
		host: defaults?.host ?? '',
		username: defaults?.username ?? '',
		credentialId: defaults?.credentialId ?? null,
		domain: defaults?.domain ?? '',
		notes: defaults?.notes ?? '',
		tags: [...(defaults?.tags ?? [])],
	});
	const port = ref(String(defaults?.port ?? 22));
	const saving = ref(false);
	const managing = ref(false);
	const credentialOptions = computed(() => [
		{ value: 'none', label: t('noCredential') },
		...(credentials.value?.items.value ?? []).map((c) => ({
			value: c.id,
			label: c.name + ' · ' + c.username,
		})),
	]);
	const credentialId = computed({
		get: () => draft.value.credentialId ?? 'none',

		set: (v: string) => {
			draft.value.credentialId = v === 'none' ? null : v;
			if (draft.value.credentialId) draft.value.username = '';
		},
	});
	watch(
		credentials,
		(api) => {
			void api?.refresh(props.signal).catch((cause) => client.report(cause, props.signal));
		},
		{ immediate: true },
	);

	watch(
		() => props.view.state.value.focused,
		(focused) => {
			if (focused) managing.value = false;
		},
	);

	function manageCredentials(): void {
		const api = credentials.value;
		if (!api || props.signal.aborted) return;
		managing.value = true;
		try {
			api.openManager();
		} catch (cause) {
			managing.value = false;
			client.report(cause, props.signal);
		}
	}

	const tagOverlay = ref(false);
	const formId = useId();
	const types = computed(() => ConnectionTypeSchema.options.map((value) => ({ value, label: t('types.' + value) })));
	watch(
		() => draft.value.type,
		(type, previous) => {
			if (Number(port.value) === connectionDefaults[previous].port)
				port.value = String(connectionDefaults[type].port);
			if (!connectionDefaults[type].username) draft.value.username = '';
			if (!connectionDefaults[type].domain) draft.value.domain = '';
		},
	);

	async function save() {
		if (saving.value || props.signal.aborted) return;
		const parsed = ConnectionInputSchema.safeParse({ ...draft.value, port: Number(port.value) });
		if (!parsed.success) {
			client.report(new Error('CONNECTIONS_INVALID_REQUEST'), props.signal);
			return;
		}
		saving.value = true;
		try {
			await client.save(parsed.data, props.duplicate ? undefined : defaults?.id, props.view);
			if (props.signal.aborted) return;
			emit('saved');
		} catch (cause) {
			client.report(cause, props.signal);
		} finally {
			saving.value = false;
		}
	}

	async function tagDeleted(_id: string, name: string) {
		await client.refresh(props.signal).catch((cause) => client.report(cause, props.signal));
		if (!props.signal.aborted) draft.value.tags = draft.value.tags.filter((tag) => tag !== name);
	}
</script>
<template>
	<UiDialog
		:open="!managing"
		:description="reason === 'credential-required' ? t('credentialRequiredHint') : undefined"
		:title="t(defaults && !duplicate ? 'edit' : 'add')"
		:close-label="t('close')"
		size="md"
		:close-disabled="saving"
		:close-on-escape="!tagOverlay"
		:close-on-interact-outside="false"
		@update:open="(value) => !value && !managing && emit('close')"
	>
		<form :id="formId" class="connections-form" @submit.prevent="save">
			<UiField :label="t('name')" v-slot="field"
				><UiInput v-model="draft.name" :id="field.id" required maxlength="120" autofocus :disabled="saving"
			/></UiField>
			<UiField :label="t('type')" v-slot="field"
				><UiSelect v-model="draft.type" :id="field.id" :options="types" block :disabled="saving"
			/></UiField>
			<div class="connections-form-address">
				<UiField :label="t('host')" v-slot="field"
					><UiInput
						v-model="draft.host"
						:id="field.id"
						required
						maxlength="253"
						autocomplete="off"
						spellcheck="false"
						:disabled="saving"
				/></UiField>
				<span class="connections-address-separator" aria-hidden="true">:</span>
				<UiField :label="t('port')" v-slot="field"
					><UiInput
						:model-value="String(port)"
						@update:model-value="port = String($event)"
						:id="field.id"
						type="number"
						required
						min="1"
						max="65535"
						step="1"
						:disabled="saving"
				/></UiField>
			</div>
			<UiField :label="t('credential')" v-slot="field"
				><div class="connections-credential">
					<UiSelect
						v-model="credentialId"
						:id="field.id"
						:options="credentialOptions"
						block
						:disabled="saving"
					/>
					<UiButton :disabled="saving || !credentials" @click="manageCredentials">{{
						t('manageCredentials')
					}}</UiButton>
				</div></UiField
			>
			<UiField v-if="connectionDefaults[draft.type].domain" :label="t('domain')" v-slot="field"
				><UiInput v-model="draft.domain" :id="field.id" maxlength="120" :disabled="saving"
			/></UiField>
			<UiField :label="t('tags')" :hint="t('tagHint')"
				><TagPicker
					v-model="draft.tags"
					:tags="catalog.tags"
					:signal="signal"
					:view="view"
					:disabled="saving"
					@deleted="tagDeleted"
					@overlay-change="tagOverlay = $event"
			/></UiField>
			<UiField :label="t('notes')" v-slot="field">
				<textarea
					:disabled="saving"
					v-model="draft.notes"
					:id="field.id"
					class="connections-notes"
					rows="3"
					maxlength="2000"
				/>
			</UiField>
		</form>
		<template #footer
			><UiButton :disabled="saving" @click="emit('close')">{{ t('cancel') }}</UiButton
			><UiButton :form="formId" type="submit" tone="primary" :loading="saving" loading-animation="spinner"
				><template #leading><Save :size="16" /></template>{{ t('save') }}</UiButton
			></template
		>
	</UiDialog>
</template>
