<script setup lang="ts">
	import { Copy, KeyRound, Link2, Save, Trash2 } from '@lucide/vue';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import { UiBadge, UiButton, UiDialog, UiField, UiInput, UiSection, UiSelect } from 'nexus-terminal/browser/ui';
	import { computed, onMounted, ref, useId } from 'vue';
	import { useI18n } from 'vue-i18n';
	import {
		OidcBindingInputSchema,
		OidcOriginSchema,
		OidcStatusSchema,
		oidcBindingCallbackPath,
		type OidcBindingInput,
	} from '../shared/oidc-http-types.js';
	import { messages } from './messages.js';
	import { bindOidcAccount, reportOidcFailure } from './oidc-client-api.js';

	const { context, view } = defineProps<PluginWindowProps>();
	const { t } = useI18n({ useScope: 'local', messages });
	const issuerId = useId();
	const bindingHintId = useId();
	const status = ref<Awaited<ReturnType<typeof loadStatus>>>();
	const form = ref<OidcBindingInput>(blankForm());
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
	const bindingInput = computed(() => OidcBindingInputSchema.safeParse(form.value));

	function blankForm(): OidcBindingInput {
		return {
			issuer: '',
			origin: location.origin,
			clientId: '',
			authMethod: 'client_secret_basic',
			clientSecret: '',
		};
	}

	function loadStatus(signal: AbortSignal) {
		return context.app.http.json('/configuration', OidcStatusSchema, { signal });
	}

	function apply(value: Awaited<ReturnType<typeof loadStatus>>) {
		status.value = value;
		if (!value.config) {
			form.value = blankForm();
			return;
		}
		const { subject: _subject, ...provider } = value.config;
		form.value = { ...provider, clientSecret: '' };
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
	<form class="oidc-app" :aria-busy="working || binding" @submit.prevent="bind">
		<UiSection :title="t('provider')" :icon="KeyRound">
			<template v-if="status?.config" #actions>
				<UiBadge tone="success" dot>{{ t('configured') }}</UiBadge>
				<UiButton
					type="button"
					appearance="ghost"
					density="compact"
					tone="danger"
					icon-only
					:aria-label="t('remove')"
					:title="t('remove')"
					:disabled="formDisabled"
					@click="confirming = true"
				>
					<Trash2 :size="16" />
				</UiButton>
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
		<UiSection class="oidc-redirects" :title="t('signIn')" :icon="Link2">
			<UiField :label="t('origin')" v-slot="{ id }">
				<UiInput :id="id" v-model="form.origin" type="url" :disabled="formDisabled" required />
			</UiField>
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
		<div class="oidc-save">
			<p :id="bindingHintId">{{ t('bindHint') }}</p>
			<UiButton
				type="submit"
				tone="primary"
				block
				loading-animation="spinner"
				:aria-describedby="bindingHintId"
				:loading="binding"
				:disabled="formDisabled || !bindingInput.success"
			>
				<template #leading><Save :size="16" /></template>
				{{ t('save') }}
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

	.oidc-redirects,
	.oidc-save {
		border-block-start: 1px solid var(--ui-border);
		padding-block-start: var(--ui-layout-gap, 16px);
	}

	.oidc-save {
		display: grid;
		gap: 10px;
	}

	.oidc-save p {
		margin: 0;
		color: var(--ui-muted);
		font-size: 12px;
		line-height: 1.7;
	}

	@container (max-width: 32rem) {
		.oidc-fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
