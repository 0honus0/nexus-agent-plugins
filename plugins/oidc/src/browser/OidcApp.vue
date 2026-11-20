<script setup lang="ts">
	import { Copy, Save, Trash2 } from '@lucide/vue';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import { UiBadge, UiButton, UiDialog, UiField, UiInput, UiSelect } from 'nexus-terminal/browser/ui';
	import { computed, onMounted, ref } from 'vue';
	import { useI18n } from 'vue-i18n';
	import {
		OidcConfigInputSchema,
		OidcOriginSchema,
		OidcStatusSchema,
		type OidcConfigInput,
	} from '../shared/oidc-http-types.js';
	import { messages } from './messages.js';
	import { reportOidcFailure } from './oidc-client-api.js';

	const { context, view } = defineProps<PluginWindowProps>();
	const { t } = useI18n({ useScope: 'local', messages });
	const status = ref<Awaited<ReturnType<typeof loadStatus>>>();
	const form = ref<OidcConfigInput>(blankForm());
	const working = ref(false);
	const confirming = ref(false);
	const methods = computed(() => [
		{ value: 'client_secret_basic', label: 'client_secret_basic' },
		{ value: 'client_secret_post', label: 'client_secret_post' },
		{ value: 'none', label: t('publicClient') },
	]);
	const redirectUri = computed(() => {
		const origin = OidcOriginSchema.safeParse(form.value.origin);
		return origin.success && status.value ? new URL(status.value.callbackPath, origin.data).href : '';
	});

	function blankForm(): OidcConfigInput {
		return {
			issuer: '',
			origin: location.origin,
			clientId: '',
			subject: '',
			authMethod: 'client_secret_basic',
			clientSecret: '',
		};
	}

	function loadStatus(signal: AbortSignal) {
		return context.app.http.json('/configuration', OidcStatusSchema, { signal });
	}

	function apply(value: Awaited<ReturnType<typeof loadStatus>>) {
		status.value = value;
		form.value = value.config ? { ...value.config, clientSecret: '' } : blankForm();
	}

	onMounted(async () => {
		try {
			apply(await loadStatus(view.signal));
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		}
	});

	async function save() {
		if (!status.value || working.value) return;
		const result = OidcConfigInputSchema.safeParse(form.value);
		if (!result.success) return;
		working.value = true;
		try {
			const next = await context.app.tasks.run(
				(signal) =>
					context.app.http.json('/configuration', OidcStatusSchema, {
						method: 'PUT',
						signal,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(result.data),
					}),
				{ view },
			);
			view.signal.throwIfAborted();
			apply(next);
			context.app.log.report({ level: 'info', code: 'OIDC_CONFIG_SAVED', userVisible: true });
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		} finally {
			working.value = false;
		}
	}

	async function remove() {
		if (!status.value?.config || working.value) return;
		working.value = true;
		try {
			const next = await context.app.tasks.run(
				(signal) => context.app.http.json('/configuration', OidcStatusSchema, { method: 'DELETE', signal }),
				{ view },
			);
			view.signal.throwIfAborted();
			apply(next);
			confirming.value = false;
			context.app.log.report({ level: 'info', code: 'OIDC_CONFIG_REMOVED', userVisible: true });
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		} finally {
			working.value = false;
		}
	}

	async function copyRedirect() {
		try {
			await navigator.clipboard.writeText(redirectUri.value);
			view.signal.throwIfAborted();
			context.app.log.report({ level: 'info', code: 'OIDC_CALLBACK_COPIED', userVisible: true });
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		}
	}
</script>

<template>
	<form class="oidc-app" :aria-busy="working" @submit.prevent="save">
		<UiBadge v-if="status?.config" tone="success">{{ t('configured') }}</UiBadge>
		<UiField id="oidc-issuer" :label="t('issuer')">
			<UiInput
				id="oidc-issuer"
				v-model="form.issuer"
				type="url"
				placeholder="https://id.example.com"
				:disabled="working"
				required
			/>
		</UiField>
		<UiField :label="t('clientId')" v-slot="{ id }">
			<UiInput :id="id" v-model="form.clientId" :disabled="working" required />
		</UiField>
		<UiField :label="t('authMethod')" v-slot="{ id }">
			<UiSelect v-model="form.authMethod" :id="id" :options="methods" :disabled="working" block />
		</UiField>
		<UiField v-if="form.authMethod !== 'none'" :label="t('clientSecret')" v-slot="{ id }">
			<UiInput
				:id="id"
				v-model="form.clientSecret"
				type="password"
				autocomplete="new-password"
				:disabled="working"
				:placeholder="
					status?.config?.authMethod !== 'none' &&
					status?.config?.issuer === form.issuer &&
					status?.config?.clientId === form.clientId
						? t('keepSecret')
						: undefined
				"
			/>
		</UiField>
		<UiField :label="t('subject')" :hint="t('subjectHint')" v-slot="{ id }">
			<UiInput :id="id" v-model="form.subject" :disabled="working" required />
		</UiField>
		<UiField :label="t('origin')" v-slot="{ id }">
			<UiInput :id="id" v-model="form.origin" type="url" :disabled="working" required />
		</UiField>
		<UiField v-if="redirectUri" :label="t('callback')" :hint="t('callbackHint')" v-slot="{ id }">
			<UiInput :id="id" :model-value="redirectUri" readonly>
				<template #trailing>
					<UiButton type="button" appearance="ghost" icon-only :aria-label="t('copy')" @click="copyRedirect">
						<Copy :size="16" />
					</UiButton>
				</template>
			</UiInput>
		</UiField>
		<div class="oidc-actions">
			<UiButton
				type="submit"
				tone="primary"
				:loading="working && !confirming"
				:disabled="!status || !redirectUri"
			>
				<Save :size="16" />{{ t('save') }}
			</UiButton>
			<UiButton
				v-if="status?.config"
				type="button"
				tone="danger"
				appearance="ghost"
				:disabled="working"
				@click="confirming = true"
			>
				<Trash2 :size="16" />{{ t('remove') }}
			</UiButton>
		</div>
		<UiDialog
			:open="confirming"
			:title="t('removeTitle')"
			:close-label="t('cancel')"
			@update:open="confirming = $event"
		>
			<template #footer>
				<UiButton :disabled="working" @click="confirming = false">{{ t('cancel') }}</UiButton>
				<UiButton tone="danger" :loading="working" @click="remove">{{ t('remove') }}</UiButton>
			</template>
		</UiDialog>
	</form>
</template>

<style scoped>
	.oidc-app {
		display: grid;
		gap: 16px;
		max-width: 640px;
		padding: 22px;
	}
	.oidc-app > :first-child {
		justify-self: start;
	}
	.oidc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
