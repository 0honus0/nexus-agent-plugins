<script setup lang="ts">
	import { ref } from 'vue';
	import { Palette, Image, Settings2, Type } from '@lucide/vue';
	import { UiTabs } from 'nexus-terminal/browser/ui';
	import type { LayoutProfile } from '../../shared/layout-types.js';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import TerminalThemes from './TerminalThemes.vue';
	import WorkspaceGeneralSettings from './WorkspaceGeneralSettings.vue';
	import TerminalBackgrounds from './TerminalBackgrounds.vue';
	import TerminalDisplaySettings from './TerminalDisplaySettings.vue';
	defineProps<{ i18n: WorkspaceI18n; active: boolean; profile: LayoutProfile }>();
	const tab = ref('display');
</script>
<template>
	<UiTabs
		v-model="tab"
		class="workspace-appearance-tabs"
		:label="i18n.t('themes')"
		:options="[
			{ value: 'display', label: i18n.t('display.title'), icon: Type },
			{ value: 'colors', label: i18n.t('background.colors'), icon: Palette },
			{ value: 'background', label: i18n.t('background.title'), icon: Image },
			{ value: 'general', label: i18n.t('general.title'), icon: Settings2 },
		]"
	>
		<template #display><TerminalDisplaySettings :i18n="i18n" :profile="profile" /></template>
		<template #colors><TerminalThemes :i18n="i18n" /></template>
		<template #background><TerminalBackgrounds :i18n="i18n" :active="active && tab === 'background'" /></template>
		<template #general><WorkspaceGeneralSettings :i18n="i18n" /></template>
	</UiTabs>
</template>
