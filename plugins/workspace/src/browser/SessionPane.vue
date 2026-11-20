<script setup lang="ts">
	import { onScopeDispose } from 'vue';
	import { useCommandTargets } from './commands/command-targets';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import type { PluginWindowApi } from 'nexus-terminal/browser';
	import type { SessionInfo } from '../shared/workspace-types';
	import type { WorkspaceI18n } from './workspace-i18n';
	import { useSessionTransport } from './use-session-transport';
	import { createTerminalInput } from './terminal/terminal-input';
	import WorkspaceSurface from './presentation/WorkspaceSurface.vue';
	const props = defineProps<{
		session: SessionInfo;
		host?: string;
		active: boolean;
		ctx: PluginContextApi;
		view: PluginWindowApi;
		i18n: WorkspaceI18n;
	}>();
	const emit = defineEmits<{ busy: [value: boolean] }>();
	const transport = useSessionTransport(props.ctx, props.session.id, props.view.signal);
	const input = createTerminalInput(transport);
	onScopeDispose(
		useCommandTargets().register(props.session.id, {
			name: props.session.name,
			input,

			ready: () => transport.connected.value && !transport.terminalClosed.value,
		}),
	);
</script>
<template>
	<WorkspaceSurface
		:context="{
			...props,
			transport,
			input,
			busy: (value) => emit('busy', value),
		}"
	/>
</template>
