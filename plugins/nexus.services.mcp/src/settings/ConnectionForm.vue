<script setup lang="ts">
	import { useI18n } from 'vue-i18n';
	import { UiButton, UiFormField, UiInput, UiSwitch, UiTextarea } from '@settings-ui/foundation/ui';

	const draft = defineModel<{ name: string; endpoint: string; privateHostsText: string; enabled: boolean }>({
		required: true,
	});
	defineProps<{ disabled: boolean; credentialPresent: boolean }>();
	const emit = defineEmits<{ credential: [] }>();
	const { t } = useI18n();
</script>

<template>
	<fieldset :disabled="disabled" class="space-y-6">
		<section class="ui-form-section space-y-5">
			<h4>{{ t('basic') }}</h4>
			<UiFormField :label="t('name')" for-id="mcp-name"
				><UiInput id="mcp-name" v-model="draft.name" autocomplete="off"
			/></UiFormField>
			<label
				for="mcp-enabled"
				class="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-header/25 px-4 py-3 text-sm font-medium"
			>
				<span>{{ t('enabled') }}</span
				><UiSwitch id="mcp-enabled" v-model="draft.enabled" :aria-label="t('enabled')" />
			</label>
		</section>
		<section class="ui-form-section space-y-5">
			<h4>{{ t('service') }}</h4>
			<UiFormField :label="t('endpoint')" for-id="mcp-endpoint"
				><UiInput id="mcp-endpoint" v-model="draft.endpoint" class="font-mono" autocomplete="off"
			/></UiFormField>
			<UiFormField :label="t('privateHosts')" for-id="mcp-private-hosts"
				><UiTextarea id="mcp-private-hosts" v-model="draft.privateHostsText" :min-rows="3" class="font-mono"
			/></UiFormField>
			<div class="rounded-xl border border-border/60 bg-header/20 p-3.5">
				<p class="text-xs text-text-secondary">
					{{ t(credentialPresent ? 'credentialPresent' : 'credentialAbsent') }}
				</p>
				<UiButton type="button" class="mt-2" :disabled="disabled" @click="emit('credential')">{{
					t('credential')
				}}</UiButton>
			</div>
		</section>
	</fieldset>
</template>
