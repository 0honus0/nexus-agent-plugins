<script setup lang="ts">
	import SettingsPage from '@settings-ui/SettingsPage.vue';
	import { UiFormField, UiSelect } from '@settings-ui/foundation/ui';

	function decode(documentJson: string): Record<string, string> {
		const value: unknown = JSON.parse(documentJson);
		if (
			typeof value !== 'object' ||
			value === null ||
			Array.isArray(value) ||
			Object.keys(value).length !== 1 ||
			!('protocolVersion' in value) ||
			value.protocolVersion !== '2026-07-28'
		) {
			throw new Error('MCP_SETTINGS_INVALID');
		}
		return { protocolVersion: value.protocolVersion };
	}
</script>
<template>
	<SettingsPage :decode="decode" v-slot="{ draft, locale, disabled }">
		<UiFormField
			:label="locale === 'zh-CN' ? '协议版本' : locale === 'ja-JP' ? 'プロトコルバージョン' : 'Protocol version'"
			for-id="mcp-protocol"
		>
			<UiSelect
				id="mcp-protocol"
				:model-value="draft.protocolVersion"
				:disabled="disabled"
				:options="[{ value: '2026-07-28', label: '2026-07-28' }]"
				@update:model-value="
					(value) => {
						if (typeof value === 'string') {
							draft.protocolVersion = value;
						}
					}
				"
			/>
		</UiFormField>
	</SettingsPage>
</template>
