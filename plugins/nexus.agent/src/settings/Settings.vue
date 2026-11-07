<script setup lang="ts">
	import SettingsPage from '@settings-ui/SettingsPage.vue';
	import { UiFormField, UiSelect, UiTextarea } from '@settings-ui/foundation/ui';

	function decode(documentJson: string): Record<string, string> {
		const value: unknown = JSON.parse(documentJson);
		if (
			typeof value !== 'object' ||
			value === null ||
			Array.isArray(value) ||
			Object.keys(value).length !== 2 ||
			!('instructions' in value) ||
			!('compactionMode' in value) ||
			typeof value.instructions !== 'string' ||
			(value.compactionMode !== 'aggressive' &&
				value.compactionMode !== 'balanced' &&
				value.compactionMode !== 'conservative')
		) {
			throw new Error('APP_SETTINGS_INVALID');
		}
		return { instructions: value.instructions, compactionMode: value.compactionMode };
	}
	function labels(locale: string) {
		return locale === 'zh-CN'
			? {
					instructions: '附加指令',
					compaction: '上下文压缩',
					aggressive: '积极',
					balanced: '均衡',
					conservative: '保守',
				}
			: locale === 'ja-JP'
				? {
						instructions: '追加指示',
						compaction: 'コンテキスト圧縮',
						aggressive: '積極的',
						balanced: 'バランス',
						conservative: '保守的',
					}
				: {
						instructions: 'Additional instructions',
						compaction: 'Context compaction',
						aggressive: 'Aggressive',
						balanced: 'Balanced',
						conservative: 'Conservative',
					};
	}
</script>
<template>
	<SettingsPage :decode="decode" v-slot="{ draft, locale, disabled }">
		<UiFormField :label="labels(locale).instructions" for-id="app-instructions">
			<UiTextarea
				id="app-instructions"
				:model-value="draft.instructions"
				:disabled="disabled"
				:min-rows="5"
				@update:model-value="draft.instructions = $event"
			/>
		</UiFormField>
		<UiFormField :label="labels(locale).compaction" for-id="app-compaction">
			<UiSelect
				id="app-compaction"
				:model-value="draft.compactionMode"
				:disabled="disabled"
				:options="
					['aggressive', 'balanced', 'conservative'].map((value) => ({
						value,
						label:
							value === 'aggressive'
								? labels(locale).aggressive
								: value === 'balanced'
									? labels(locale).balanced
									: labels(locale).conservative,
					}))
				"
				@update:model-value="
					(value) => {
						if (typeof value === 'string') {
							draft.compactionMode = value;
						}
					}
				"
			/>
		</UiFormField>
	</SettingsPage>
</template>
