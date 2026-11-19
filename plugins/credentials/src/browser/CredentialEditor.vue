<script setup lang="ts">
	import { ref, computed, useId } from 'vue';
	import type { PluginWindowApi } from 'nexus-terminal/browser';
	import { useI18n } from 'vue-i18n';
	import { Save, Upload, KeyRound } from '@lucide/vue';
	import { UiDialog, UiButton, UiInput, UiSelect, UiField } from 'nexus-terminal/browser/ui';
	import {
		privateKeyLimit,
		CredentialInputSchema,
		CredentialPatchSchema,
		type Credential,
	} from '../shared/credentials-types';
	import type { CredentialsClient } from './credentials-client-api.js';
	const props = defineProps<{ runtime: CredentialsClient; credential?: Credential; view: PluginWindowApi }>(),
		emit = defineEmits<{ close: [] }>();
	const { t } = useI18n({ useScope: 'parent' });
	const form = useId(),
		file = ref<HTMLInputElement>(),
		saving = ref(false),
		clear = ref(false);
	const draft = ref({
		name: props.credential?.name ?? '',
		username: props.credential?.username ?? '',
		type: props.credential?.type ?? 'password',
		password: '',
		privateKey: '',
		passphrase: '',
	});
	const changedType = computed(() => !props.credential || props.credential.type !== draft.value.type);
	const types = computed(() => [
		{ value: 'password', label: t('passwordType') },
		{ value: 'privateKey', label: t('privateKeyType') },
	]);

	async function upload(event: Event) {
		const input = event.target as HTMLInputElement,
			f = input.files?.[0];
		if (!f) return;
		try {
			if (f.size > privateKeyLimit) throw new Error('CREDENTIALS_FILE_TOO_LARGE');
			const value = await f.text();
			if (!props.view.signal.aborted) draft.value.privateKey = value;
		} catch (e) {
			if (!props.view.signal.aborted) props.runtime.report(e, props.view.signal);
		} finally {
			input.value = '';
		}
	}

	async function save() {
		if (saving.value || props.view.signal.aborted) return;
		saving.value = true;
		try {
			const d = draft.value;
			const value: Record<string, unknown> = { name: d.name, username: d.username, type: d.type };
			if (d.type === 'password') {
				if (d.password || changedType.value) value.password = d.password;
			} else {
				if (d.privateKey || changedType.value) value.privateKey = d.privateKey;
				if (d.passphrase || changedType.value || clear.value)
					value.passphrase = clear.value ? null : d.passphrase || null;
			}
			const schema = props.credential ? CredentialPatchSchema : CredentialInputSchema,
				parsed = schema.safeParse(value);
			if (!parsed.success) throw new Error('CREDENTIALS_INVALID_REQUEST');
			await props.runtime.save(parsed.data, props.credential?.id, props.view);
			if (props.view.signal.aborted) return;
			draft.value.password = '';
			draft.value.privateKey = '';
			draft.value.passphrase = '';
			emit('close');
		} catch (e) {
			if (!props.view.signal.aborted) props.runtime.report(e, props.view.signal);
		} finally {
			saving.value = false;
		}
	}
</script>
<template>
	<UiDialog
		class="credentials-editor"
		:open="true"
		:title="t(credential ? 'edit' : 'add')"
		:close-label="t('close')"
		size="md"
		:close-disabled="saving"
		:close-on-interact-outside="false"
		@update:open="(value) => !value && emit('close')"
	>
		<form :id="form" class="credentials-form" @submit.prevent="save">
			<div class="credentials-form-pair">
				<UiField :label="t('name')" v-slot="f"
					><UiInput
						v-model="draft.name"
						:id="f.id"
						required
						maxlength="120"
						autofocus
						:disabled="saving" /></UiField
				><UiField :label="t('username')" v-slot="f"
					><UiInput
						v-model="draft.username"
						:id="f.id"
						required
						maxlength="120"
						autocomplete="off"
						:disabled="saving"
				/></UiField>
			</div>
			<UiField :label="t('type')" v-slot="f"
				><UiSelect v-model="draft.type" :id="f.id" :options="types" block :disabled="saving"
			/></UiField>
			<UiField
				v-if="draft.type === 'password'"
				:label="t('password')"
				:hint="changedType ? '' : t('keepSecret')"
				v-slot="f"
				><UiInput
					v-model="draft.password"
					:id="f.id"
					type="password"
					:required="changedType"
					autocomplete="new-password"
					:disabled="saving"
			/></UiField>
			<template v-else
				><UiField :label="t('privateKey')" :hint="t('uploadHint')" v-slot="f">
					<textarea
						:disabled="saving"
						v-model="draft.privateKey"
						:id="f.id"
						class="credentials-key"
						:required="changedType"
						rows="6"
						spellcheck="false"
						autocomplete="off"
						:placeholder="changedType ? '' : t('keepSecret')"
					/>
				</UiField>
				<input ref="file" type="file" hidden @change="upload" /><UiButton
					class="credentials-upload"
					:disabled="saving"
					appearance="soft"
					@click="file?.click()"
					><Upload :size="16" />{{ t('upload') }}</UiButton
				>
				<UiField :label="t('passphrase')" :hint="changedType ? '' : t('keepSecret')" v-slot="f"
					><UiInput
						v-model="draft.passphrase"
						:id="f.id"
						type="password"
						:disabled="clear || saving"
						autocomplete="new-password"
				/></UiField>
				<label v-if="credential?.hasPassphrase" class="credentials-clear"
					><input v-model="clear" type="checkbox" :disabled="saving" />{{ t('clearPassphrase') }}</label
				></template
			>
		</form>
		<template #footer
			><UiButton :disabled="saving" @click="emit('close')">{{ t('cancel') }}</UiButton
			><UiButton :form="form" type="submit" tone="primary" :loading="saving" loading-animation="spinner"
				><template #leading><Save :size="16" /></template>{{ t('save') }}</UiButton
			></template
		>
	</UiDialog>
</template>
