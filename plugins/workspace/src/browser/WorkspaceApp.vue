<script setup lang="ts">
	import { useWindowSize } from '@vueuse/core';
	import { Terminal, Home, Fingerprint, Pause, ArrowDownUp } from '@lucide/vue';
	import { UiButton, UiDialog } from 'nexus-terminal/browser/ui';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import type { WorkspaceI18n } from './workspace-i18n';
	import { computed, onScopeDispose, provide, defineAsyncComponent, defineComponent, h, ref, watch } from 'vue';
	import { createWorkspaceFilesState, workspaceFilesStateKey } from './files/workspace-files-state';
	import { createWorkspaceTransfers, workspaceTransfersKey } from './transfers/workspace-transfers';
	import TransferCenter from './transfers/TransferCenter.vue';
	import { LayoutProfiles } from '../shared/layout-types.js';
	import WorkspaceLoading from './WorkspaceLoading.vue';
	import WorkspaceHome from './WorkspaceHome.vue';
	import { useWorkspaceSessions } from './use-workspace-sessions';
	import { createWorkspaceLayoutState, workspaceLayoutStateKey } from './presentation/workspace-layout-state';
	const props = defineProps<PluginWindowProps & { ctx: PluginContextApi; i18n: WorkspaceI18n }>();
	const { t } = props.i18n;
	const layouts = createWorkspaceLayoutState(props.ctx);
	provide(workspaceLayoutStateKey, layouts);
	let sessionModule: Promise<typeof import('./WorkspaceSessionTabs.vue')> | undefined;

	function loadSessionTabs() {
		return (sessionModule ??= import('./WorkspaceSessionTabs.vue').catch((cause: unknown) => {
			sessionModule = undefined;
			throw cause;
		}));
	}

	const WorkspaceSessionTabs = defineAsyncComponent({
		loader: loadSessionTabs,

		loadingComponent: WorkspaceLoading,
		delay: 0,
	});
	let filesState: ReturnType<typeof createWorkspaceFilesState> | undefined;
	const transfers = createWorkspaceTransfers(props.ctx, props.view, () => filesState?.changed());
	provide(workspaceTransfersKey, transfers);
	const { width: viewportWidth } = useWindowSize();
	const narrowTransfers = computed(() => viewportWidth.value < LayoutProfiles.wide.minWidth);
	const TransferIcon = defineComponent(
		() => () =>
			h('span', { class: 'workspace-transfer-action-icon' }, [
				h(ArrowDownUp, { size: 16 }),
				...(transfers.active.value.length ? [h('small', String(transfers.active.value.length))] : []),
			]),
	);
	onScopeDispose(
		props.view.registerActions({
			items: computed(() => [{ id: 'transfers', label: t('transferCenter.title'), icon: TransferIcon }]),

			onSelect() {
				transfers.open.value = !transfers.open.value;
			},
		}),
	);
	watch(
		() => props.view.state.value.mode,
		(mode) => {
			if (mode === 'minimized') transfers.open.value = false;
		},
	);

	const {
		connections,
		connectionsLoaded,
		connectionsReadFailed,
		retryConnections,
		savedConnections,
		suspended,
		tabs,
		active,
		selected,
		connecting,
		suspending,
		host,
		busySessions,
		confirmOpen,
		answer,
		manage,
		start,
		add,
		connect,
		close,
		suspend,
	} = useWorkspaceSessions({ ...props, hasTransfers: transfers.hasPending, prepareSuspend: layouts.prepareSuspend });

	watch(
		connecting,
		(pending) => {
			if (pending) void loadSessionTabs().catch(() => undefined);
		},
		{ flush: 'sync' },
	);

	const sessionsOpened = ref(false);
	watch(
		() => tabs.value.length,
		(count) => {
			if (count) sessionsOpened.value = true;
		},
	);

	filesState = createWorkspaceFilesState(tabs, savedConnections, start);
	provide(workspaceFilesStateKey, filesState);
	const windowTabs = computed(() => [
		...(active.value === 'home' ? [{ id: 'home', label: t('connection'), icon: Home }] : []),
		...tabs.value.map((tab) => {
			const peers = tabs.value.filter((s) => s.connectionId === tab.connectionId);
			return {
				id: tab.id,
				label: tab.name + (peers.length > 1 ? ' · ' + (peers.findIndex((s) => s.id === tab.id) + 1) : ''),
				icon: Terminal,
				closable: true,
				menu: [{ id: 'suspend', label: t('suspend'), icon: Pause, disabled: suspending.value }],
			};
		}),
	]);
	onScopeDispose(
		props.view.registerTabs({
			items: windowTabs,
			activeId: active,

			addLabel: () => t('newSession'),

			onSelect: (id) => {
				active.value = id;
			},

			onClose: close,

			onMenuSelect: (id, action) => {
				if (action === 'suspend') return suspend(id);
			},

			onAdd: () => {
				active.value = 'home';
			},
		}),
	);
</script>
<template>
	<section class="workspace-app" data-ui-selection="none">
		<WorkspaceHome
			v-show="active === 'home'"
			:connections="savedConnections"
			:suspended="suspended"
			:connections-available="!!connections"
			:connections-loaded="connectionsLoaded"
			:connections-read-failed="connectionsReadFailed"
			:selected="selected"
			:connecting="connecting"
			:i18n="i18n"
			@connect="start"
			@resume="add"
			@close="close"
			@manage="manage"
			@retry="retryConnections"
		/>
		<div v-if="sessionsOpened" v-show="active !== 'home'" class="workspace-sessions">
			<WorkspaceSessionTabs
				:tabs="tabs"
				:active="active"
				:connections="savedConnections"
				:ctx="ctx"
				:view="view"
				:i18n="i18n"
				@busy="(id, value) => (busySessions[id] = value)"
			/>
		</div>
	</section>

	<TransferCenter :transfers="transfers" :i18n="i18n" :narrow="narrowTransfers" />
	<UiDialog
		:open="confirmOpen"
		:title="t('stopTransfers')"
		:description="t('stopTransfersHint')"
		:close-label="t('cancel')"
		@update:open="
			(value) => {
				if (!value) answer(false);
			}
		"
	>
		<template #footer
			><UiButton @click="answer(false)">{{ t('cancel') }}</UiButton
			><UiButton tone="danger" @click="answer(true)">{{ t('continue') }}</UiButton></template
		>
	</UiDialog>
	<UiDialog
		:open="!!host"
		:title="t(host?.previousFingerprint ? 'hostChanged' : 'hostTitle')"
		:description="t('hostHint')"
		:close-label="t('close')"
		:close-on-interact-outside="false"
		@update:open="
			(v) => {
				if (!v && !connecting) host = undefined;
			}
		"
		><div class="workspace-fingerprint">
			<span class="workspace-fingerprint__label"><Fingerprint :size="18" />{{ t('fingerprint') }}</span
			><code>{{ host?.fingerprint }}</code
			><template v-if="host?.previousFingerprint"
				><span>{{ t('previous') }}</span
				><code>{{ host.previousFingerprint }}</code></template
			>
		</div>
		<template #footer
			><UiButton :disabled="connecting" @click="host = undefined">{{ t('cancel') }}</UiButton
			><UiButton tone="primary" :loading="connecting" @click="connect(host?.fingerprint)">{{
				t('trust')
			}}</UiButton></template
		></UiDialog
	>
</template>
