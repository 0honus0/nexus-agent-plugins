<script setup lang="ts">
	import { onScopeDispose } from 'vue';
	import { useI18n } from 'vue-i18n';
	import { createWorkspaceI18n } from './workspace-i18n';
	const { locale } = useI18n({ useScope: 'global' });
	const i18n = createWorkspaceI18n(locale);
	onScopeDispose(i18n.dispose);
</script>

<template>
	<div class="workspace-loading" role="status">{{ i18n.t('loadingWorkspace') }}</div>
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
