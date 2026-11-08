<script setup lang="ts">
	import SettingsPage from '@settings-ui/SettingsPage.vue';
	import BrowserTargets from './BrowserTargets.vue';
	import { readAgentBrowserPluginConfiguration } from '@nexus-terminal/shared/agent/integrations/browser-codec';

	function decode(documentJson: string) {
		const value: unknown = JSON.parse(documentJson);
		return readAgentBrowserPluginConfiguration(value);
	}
</script>
<template>
	<SettingsPage :decode="decode" v-slot="{ draft, updateDraft, locale, disabled }">
		<BrowserTargets
			:model-value="draft.targets"
			:locale="locale"
			:disabled="disabled"
			@update:model-value="(targets) => updateDraft({ targets })"
		/>
	</SettingsPage>
</template>
