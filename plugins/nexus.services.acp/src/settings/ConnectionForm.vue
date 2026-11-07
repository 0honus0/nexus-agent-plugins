<script setup lang="ts">
	import { useI18n } from 'vue-i18n';
	import { UiButton, UiFormField, UiInput, UiSwitch, UiTextarea } from '@settings-ui/foundation/ui';

	const draft = defineModel<{ name: string; argvJson: string; cwd: string; enabled: boolean }>({ required: true });
	defineProps<{ disabled: boolean; targetName: string }>();
	const emit = defineEmits<{ target: [] }>();
	const { t } = useI18n();
</script>

<template>
	<fieldset :disabled="disabled" class="space-y-6">
		<section class="ui-form-section space-y-5">
			<h4>{{ t('basic') }}</h4>
			<UiFormField :label="t('name')" for-id="acp-name"
				><UiInput id="acp-name" v-model="draft.name" autocomplete="off"
			/></UiFormField>
			<label
				for="acp-enabled"
				class="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-header/25 px-4 py-3 text-sm font-medium"
			>
				<span>{{ t('enabled') }}</span
				><UiSwitch id="acp-enabled" v-model="draft.enabled" :aria-label="t('enabled')" />
			</label>
		</section>
		<section class="ui-form-section space-y-5">
			<h4>{{ t('service') }}</h4>
			<div class="rounded-xl border border-border/60 bg-header/20 p-3.5">
				<p class="text-xs text-text-secondary">{{ targetName || t('chooseTarget') }}</p>
				<UiButton type="button" class="mt-2" :disabled="disabled" @click="emit('target')">{{
					t('chooseTarget')
				}}</UiButton>
			</div>
			<UiFormField :label="t('argv')" for-id="acp-argv"
				><UiTextarea id="acp-argv" v-model="draft.argvJson" :min-rows="3" class="font-mono"
			/></UiFormField>
			<UiFormField :label="t('cwd')" for-id="acp-cwd"
				><UiInput id="acp-cwd" v-model="draft.cwd" class="font-mono"
			/></UiFormField>
		</section>
	</fieldset>
</template>
