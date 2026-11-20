<script setup lang="ts">
	import { Copy, ClipboardPaste, ScanText, X } from '@lucide/vue';
	import { UiButton } from 'nexus-terminal/browser/ui';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import type { useTerminalInteractions } from './use-terminal-interactions';
	const props = defineProps<{
		controls: ReturnType<typeof useTerminalInteractions>;
		i18n: WorkspaceI18n;
	}>();
	const { menu, handles, selected } = props.controls;
</script>
<template>
	<div
		v-if="menu"
		class="workspace-terminal-selection-tools"
		role="toolbar"
		:aria-label="i18n.t('selection.title')"
		:style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
		@pointerdown.stop.prevent
	>
		<UiButton
			appearance="ghost"
			icon-only
			:aria-label="i18n.t('selection.copy')"
			:disabled="!selected"
			@click="controls.copy"
			><Copy :size="17"
		/></UiButton>
		<UiButton
			appearance="ghost"
			icon-only
			:aria-label="i18n.t('selection.paste')"
			:disabled="!controls.canPaste()"
			@click="controls.paste"
			><ClipboardPaste :size="17"
		/></UiButton>
		<UiButton appearance="ghost" icon-only :aria-label="i18n.t('selection.all')" @click="controls.selectAll"
			><ScanText :size="17"
		/></UiButton>
		<UiButton appearance="ghost" icon-only :aria-label="i18n.t('selection.close')" @click="controls.close()"
			><X :size="17"
		/></UiButton>
	</div>
	<template v-for="handle in ['start', 'end'] as const" :key="handle">
		<button
			v-if="handles[handle]"
			type="button"
			class="workspace-terminal-selection-handle"
			:aria-label="i18n.t('selection.' + handle)"
			:style="{ left: `${handles[handle]!.x}px`, top: `${handles[handle]!.y}px` }"
			@pointerdown="controls.startHandle(handle, $event)"
		/>
	</template>
</template>
<style scoped>
	.workspace-terminal-selection-tools {
		position: absolute;
		transform: translateX(-50%);
		z-index: 4;
		display: flex;
		gap: 3px;
		padding: 4px;
		border-radius: 12px;
		background: var(--ui-surface);
		border: 1px solid var(--ui-border);
		box-shadow: 0 4px 18px #0003;
		max-width: calc(100% - 16px);
	}
	.workspace-terminal-selection-handle {
		position: absolute;
		z-index: 3;
		width: 28px;
		height: 32px;
		transform: translateX(-50%);
		touch-action: none;
		border: 0;
		background: transparent;
	}
	.workspace-terminal-selection-handle::before {
		content: '';
		position: absolute;
		inset: 0 6px 14px;
		background: var(--ui-primary, #8065c0);
		border: 2px solid white;
		border-radius: 50%;
		box-shadow: 0 1px 5px #0005;
	}
</style>
