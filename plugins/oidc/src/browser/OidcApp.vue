<script setup lang="ts">
	import { Copy, KeyRound, Link2, Save, ShieldCheck, Trash2 } from '@lucide/vue';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import { UiBadge, UiButton, UiDialog, UiField, UiInput, UiSection, UiSelect } from 'nexus-terminal/browser/ui';
	import { computed, onMounted, ref, useId } from 'vue';
	import { useI18n } from 'vue-i18n';
	import {
		OidcBindingInputSchema,
		OidcConfigInputSchema,
		OidcOriginSchema,
		OidcStatusSchema,
		oidcBindingCallbackPath,
		type OidcConfigInput,
	} from '../shared/oidc-http-types.js';
	import { messages } from './messages.js';
	import { bindOidcAccount, reportOidcFailure } from './oidc-client-api.js';

	const { context, view } = defineProps<PluginWindowProps>();
	const { t } = useI18n({ useScope: 'local', messages });
	const issuerId = useId();
	const status = ref<Awaited<ReturnType<typeof loadStatus>>>();
	const form = ref<OidcConfigInput>(blankForm());
	const working = ref(false);
	const binding = ref(false);
	const formDisabled = computed(() => !status.value || working.value || binding.value);
	const confirming = ref(false);
	const methods = computed(() => [
		{ value: 'client_secret_basic', label: t('basicAuthentication') },
		{ value: 'client_secret_post', label: t('bodyAuthentication') },
		{ value: 'none', label: t('publicClient') },
	]);
	const redirects = computed(() => {
		const origin = OidcOriginSchema.safeParse(form.value.origin);
		return [
			{ label: 'callback', hint: 'callbackHint', path: status.value?.callbackPath },
			{ label: 'bindingCallback', hint: 'bindingCallbackHint', path: oidcBindingCallbackPath },
		].map(({ label, hint, path }) => ({
			label,
			hint,
			uri: origin.success && status.value && path ? new URL(path, origin.data).href : '',
		}));
	});
	const bindingInput = computed(() => {
		const { subject: _subject, ...input } = form.value;
		return OidcBindingInputSchema.safeParse(input);
	});
	const configInput = computed(() => OidcConfigInputSchema.safeParse(form.value));

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
			const initial = await loadStatus(view.signal);
			view.signal.throwIfAborted();
			apply(initial);
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		}
	});

	async function save() {
		if (formDisabled.value) return;
		const result = configInput.value;
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

	async function bind() {
		const input = bindingInput.value;
		if (formDisabled.value || !input.success) return;
		binding.value = true;
		try {
			await bindOidcAccount(context, input.data, view.signal);
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		} finally {
			binding.value = false;
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

	async function copyRedirect(uri: string) {
		try {
			await navigator.clipboard.writeText(uri);
			view.signal.throwIfAborted();
			context.app.log.report({ level: 'info', code: 'OIDC_CALLBACK_COPIED', userVisible: true });
		} catch (cause) {
			reportOidcFailure(context, cause, view.signal);
		}
	}
</script>

<template>
	<form class="oidc-app" :aria-busy="working || binding" @submit.prevent="save">
		<UiSection appearance="panel" :title="t('provider')" :icon="KeyRound">
			<template v-if="status?.config" #actions>
				<UiBadge tone="success" dot>{{ t('configured') }}</UiBadge>
			</template>
			<template #default>
				<div class="oidc-fields">
					<UiField :id="issuerId" :label="t('issuer')">
						<UiInput
							:id="issuerId"
							v-model="form.issuer"
							type="url"
							placeholder="https://id.example.com"
							:disabled="formDisabled"
							required
						/>
					</UiField>
					<UiField :label="t('clientId')" v-slot="{ id }">
						<UiInput :id="id" v-model="form.clientId" :disabled="formDisabled" required />
					</UiField>
					<UiField :label="t('authMethod')" v-slot="{ id }">
						<UiSelect
							v-model="form.authMethod"
							:id="id"
							:options="methods"
							:disabled="formDisabled"
							block
						/>
					</UiField>
					<UiField v-if="form.authMethod !== 'none'" :label="t('clientSecret')" v-slot="{ id }">
						<UiInput
							:id="id"
							v-model="form.clientSecret"
							type="password"
							autocomplete="new-password"
							:disabled="formDisabled"
							:placeholder="
								status?.config?.authMethod !== 'none' &&
								status?.config?.issuer === form.issuer &&
								status?.config?.clientId === form.clientId
									? t('keepSecret')
									: undefined
							"
						/>
					</UiField>
				</div>
			</template>
		</UiSection>
		<UiSection appearance="panel" :title="t('signIn')" :icon="Link2">
			<div class="oidc-fields">
				<UiField :label="t('subject')" :hint="t('subjectHint')" v-slot="{ id, describedby }">
					<UiInput :id="id" v-model="form.subject" :aria-describedby="describedby" :disabled="formDisabled" />
				</UiField>
				<UiField :label="t('origin')" v-slot="{ id }">
					<UiInput :id="id" v-model="form.origin" type="url" :disabled="formDisabled" required />
				</UiField>
			</div>
			<UiField
				v-for="redirect in redirects"
				:key="redirect.label"
				:label="t(redirect.label)"
				:hint="t(redirect.hint)"
				v-slot="{ id, describedby }"
			>
				<UiInput
					:id="id"
					:model-value="redirect.uri"
					:aria-describedby="describedby"
					:disabled="!redirect.uri"
					readonly
				>
					<template #trailing>
						<UiButton
							appearance="ghost"
							density="compact"
							icon-only
							:aria-label="t('copy', { name: t(redirect.label) })"
							:disabled="!redirect.uri"
							@click="copyRedirect(redirect.uri)"
						>
							<Copy :size="15" />
						</UiButton>
					</template>
				</UiInput>
			</UiField>
		</UiSection>
		<div class="oidc-actions">
			<UiButton
				v-if="status?.config"
				type="button"
				tone="danger"
				appearance="ghost"
				:disabled="formDisabled"
				@click="confirming = true"
			>
				<template #leading><Trash2 :size="16" /></template>
				{{ t('remove') }}
			</UiButton>
			<div class="oidc-save">
				<UiButton
					v-if="status?.config || form.subject"
					type="submit"
					loading-animation="spinner"
					:loading="working && !confirming"
					:disabled="formDisabled || !configInput.success"
				>
					<template #leading><Save :size="16" /></template>
					{{ t('save') }}
				</UiButton>
				<UiButton
					type="button"
					tone="primary"
					loading-animation="spinner"
					:loading="binding"
					:disabled="formDisabled || !bindingInput.success"
					@click="bind"
				>
					<template #leading><ShieldCheck :size="16" /></template>
					{{ t('bind') }}
				</UiButton>
			</div>
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
		--ui-section-padding: 18px;
		container-type: inline-size;
		display: grid;
		gap: var(--ui-layout-gap, 16px);
		max-width: 820px;
		margin-inline: auto;
		padding: clamp(16px, 4vw, 24px);
	}

	.oidc-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: var(--ui-layout-gap, 16px);
	}

	.oidc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	.oidc-save {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 12px;
		margin-inline-start: auto;
	}

	@container (max-width: 32rem) {
		.oidc-fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
