<script setup lang="ts">
	import { provide } from 'vue';
	import type { Connection } from '@nexus-terminal/connections/connections-client-api';
	import type { PluginContextApi, PluginWindowApi } from 'nexus-terminal/browser';
	import type { SessionInfo } from '../shared/workspace-types';
	import type { WorkspaceI18n } from './workspace-i18n';
	import { createWorkspaceLayoutState, workspaceLayoutStateKey } from './presentation/workspace-layout-state';
	import { createWorkspaceCatalog, workspaceCatalogKey } from './catalog/workspace-catalog';
	import { createWorkspaceBackground, workspaceBackgroundKey } from './appearance/workspace-background';
	import { createCommandTargets, commandTargetsKey } from './commands/command-targets';
	import SessionPane from './SessionPane.vue';
	const props = defineProps<{
		tabs: readonly SessionInfo[];
		active: string;
		connections: readonly Connection[];
		ctx: PluginContextApi;
		view: PluginWindowApi;
		i18n: WorkspaceI18n;
	}>();
	const emit = defineEmits<{ busy: [id: string, value: boolean] }>();

	// 各会话共用这组设置和工具，首次连接前不初始化。
	provide(workspaceBackgroundKey, createWorkspaceBackground(props.ctx, props.view));
	provide(commandTargetsKey, createCommandTargets());
	provide(workspaceCatalogKey, createWorkspaceCatalog(props.ctx));
	provide(workspaceLayoutStateKey, createWorkspaceLayoutState(props.ctx));
</script>

<template>
	<div
		v-for="tab in tabs"
		:key="tab.id"
		v-show="active === tab.id"
		class="workspace-tab-panel"
		:data-state="active === tab.id ? 'active' : 'inactive'"
	>
		<SessionPane
			:session="tab"
			:host="connections.find((connection) => connection.id === tab.connectionId)?.host"
			:active="active === tab.id"
			:ctx="ctx"
			:view="view"
			:i18n="i18n"
			@busy="(value) => emit('busy', tab.id, value)"
		/>
	</div>
</template>
