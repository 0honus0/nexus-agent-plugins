<script setup lang="ts">
	import { onScopeDispose } from 'vue';
	import { useI18n } from 'vue-i18n';
	import * as ui from 'nexus-terminal/browser/ui';
	import { createWorkspaceI18n } from './workspace-i18n';
	// 较早的宿主 SDK 尚未提供加载组件，窗口仍可显示状态。
	const UiLoadingTiles = Reflect.get(ui, 'UiLoadingTiles') as typeof ui.UiLoadingTiles | undefined;
	const { locale } = useI18n({ useScope: 'global' });
	const i18n = createWorkspaceI18n(locale);
	onScopeDispose(i18n.dispose);
</script>

<template>
	<div class="workspace-loading">
		<component :is="UiLoadingTiles" v-if="UiLoadingTiles" :label="i18n.t('loadingWorkspace')" />
		<span v-else role="status">{{ i18n.t('loadingWorkspace') }}</span>
	</div>
</template>

<style scoped>
	.workspace-loading {
		display: grid;
		flex: 1;
		min-height: 100%;
		place-items: center;
		padding: 24px;
		color: var(--ui-muted);
		font-size: 14px;
	}
</style>
