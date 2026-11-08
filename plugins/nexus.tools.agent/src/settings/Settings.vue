<script setup lang="ts">
	import SettingsPage from '@settings-ui/SettingsPage.vue';
	import { UiFormField, UiInput } from '@settings-ui/foundation/ui';

	function decode(documentJson: string): { maxRecallItems: number; maxRecallBytes: number } {
		const value: unknown = JSON.parse(documentJson);
		if (
			typeof value !== 'object' ||
			value === null ||
			Array.isArray(value) ||
			Object.keys(value).length !== 2 ||
			!('maxRecallItems' in value) ||
			!('maxRecallBytes' in value) ||
			typeof value.maxRecallItems !== 'number' ||
			!Number.isSafeInteger(value.maxRecallItems) ||
			value.maxRecallItems < 1 ||
			typeof value.maxRecallBytes !== 'number' ||
			!Number.isSafeInteger(value.maxRecallBytes) ||
			value.maxRecallBytes < 1
		) {
			throw new Error('RECALL_SETTINGS_INVALID');
		}
		return { maxRecallItems: value.maxRecallItems, maxRecallBytes: value.maxRecallBytes };
	}
	function labels(locale: string) {
		return locale === 'zh-CN'
			? {
					items: '记忆召回条数',
					bytes: '记忆召回总字节',
					hint: '仅对当前插件实例生效。单次调用也可请求更少的条数。',
				}
			: locale === 'ja-JP'
				? {
						items: 'メモリ想起件数',
						bytes: 'メモリ想起の合計バイト数',
						hint: 'このプラグインインスタンスのみに適用されます。呼び出し時に少ない件数を指定できます。',
					}
				: {
						items: 'Memory recall items',
						bytes: 'Memory recall total bytes',
						hint: 'Applies only to this plugin instance. Calls can request fewer items.',
					};
	}
	function update(value: string | number | null, assign: (value: number) => void) {
		assign(value === null || value === '' ? 0 : Number(value));
	}
</script>
<template>
	<SettingsPage :decode="decode" v-slot="{ draft, locale, disabled }">
		<p class="text-xs text-text-secondary">{{ labels(locale).hint }}</p>
		<UiFormField :label="labels(locale).items" for-id="recall-items">
			<UiInput
				id="recall-items"
				type="number"
				:min="1"
				:max="Number.MAX_SAFE_INTEGER"
				:step="1"
				:model-value="draft.maxRecallItems"
				:disabled="disabled"
				@update:model-value="(value) => update(value, (next) => (draft.maxRecallItems = next))"
			/>
		</UiFormField>
		<UiFormField :label="labels(locale).bytes" for-id="recall-bytes">
			<UiInput
				id="recall-bytes"
				type="number"
				:min="1"
				:max="Number.MAX_SAFE_INTEGER"
				:step="1"
				:model-value="draft.maxRecallBytes"
				:disabled="disabled"
				@update:model-value="(value) => update(value, (next) => (draft.maxRecallBytes = next))"
			/>
		</UiFormField>
	</SettingsPage>
</template>
