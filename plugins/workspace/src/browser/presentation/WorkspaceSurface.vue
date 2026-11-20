<script setup lang="ts">
	import { computed, ref, shallowReactive, type ComponentPublicInstance } from 'vue';
	import { useResizeObserver } from '@vueuse/core';
	import { DockviewVue } from 'dockview-vue';
	import { GripHorizontal } from '@lucide/vue';
	import { UiDialog, UiTransition } from 'nexus-terminal/browser/ui';
	import { createPresentationRegistry, type PresentationContext } from './presentation-registry';
	import type { WorkspacePane } from '../../shared/workspace-layout-types';
	import type { WorkspaceTool } from './presentation-types';
	import { usePresentation } from './use-presentation';
	import WorkspaceNavigation from './WorkspaceNavigation.vue';
	const props = defineProps<{ context: PresentationContext }>();
	const presentation = usePresentation(() => props.context);
	const {
		config,
		toolOpen,
		navigation,
		locked,
		ready,
		resize,
		resizeViewport,
		visible,
		profile,
		panelVisibility,
		minimumSize,
	} = presentation;
	const definitions = createPresentationRegistry(
		() => props.context,
		visible,
		() => profile.value,
	);
	const dockViewport = ref<HTMLElement>();
	const root = ref<HTMLElement>(),
		parking = ref<HTMLElement>();
	const targets = shallowReactive<Partial<Record<WorkspaceTool, HTMLElement>>>({});
	const toolTargets = shallowReactive<Partial<Record<WorkspaceTool, HTMLElement>>>({});

	function bind(id: WorkspaceTool, node: Element | ComponentPublicInstance | null, tool = false) {
		(tool ? toolTargets : targets)[id] = node instanceof HTMLElement ? node : undefined;
	}

	const regionDefinitions = computed(() => definitions.value.filter((item) => item.kind === 'region'));
	const tools = computed(() =>
		definitions.value.filter((item) => config.value.tools[item.id] && !panelVisibility[item.id as WorkspacePane]),
	);
	useResizeObserver(root, ([entry]) => {
		if (entry) resize(entry.contentRect.width);
	});
	useResizeObserver(
		dockViewport,
		([entry]) => {
			const box = entry?.borderBoxSize[0];
			if (box) resizeViewport(box.inlineSize, box.blockSize);
		},
		{ box: 'border-box' },
	);
	const theme = { name: 'nexus', className: 'workspace-dock-theme' };
</script>
<template>
	<section ref="root" class="workspace-session workspace-surface" :data-profile="profile">
		<WorkspaceNavigation
			v-if="navigation.length"
			:items="navigation"
			:config="config.navigation"
			:label="context.i18n.t('workspaceTools')"
		/>
		<div class="workspace-stage">
			<div v-if="context.transport.terminalClosed.value" class="workspace-layout-help">
				{{ context.i18n.t('terminalEnded') }}
			</div>
			<div ref="dockViewport" class="workspace-dock-viewport">
				<DockviewVue
					class="workspace-dock"
					:style="{ minWidth: minimumSize.width + 'px', minHeight: minimumSize.height + 'px' }"
					:theme="theme"
					:locked="false"
					:disable-dnd="locked"
					:disable-floating-groups="true"
					single-tab-mode="fullwidth"
					dnd-strategy="pointer"
					default-renderer="always"
					@ready="ready"
				>
					<template v-for="item in regionDefinitions" :key="item.id" #[`panel-${item.id}`]
						><div :ref="(node) => bind(item.id, node)" class="workspace-dock-anchor" :data-pane="item.id"
					/></template>
					<template #defaultTab="params">
						<UiTransition preset="drop">
							<div
								v-if="!locked"
								class="workspace-pane-grip"
								:aria-label="context.i18n.t('moveRegion', { name: context.i18n.t(params.api.id) })"
								:title="context.i18n.t('moveRegion', { name: context.i18n.t(params.api.id) })"
							>
								<GripHorizontal :size="18" />
							</div>
						</UiTransition>
					</template>
				</DockviewVue>
			</div>
			<template v-for="item in tools" :key="item.id">
				<UiDialog
					v-if="config.tools[item.id]?.presentation === 'sheet'"
					:open="context.active && !!toolOpen[item.id]"
					:title="context.i18n.t(item.id)"
					:close-label="context.i18n.t('close')"
					class="workspace-tool-sheet"
					@update:open="toolOpen[item.id] = $event"
					><div :ref="(node) => bind(item.id, node, true)" class="workspace-sheet-anchor"
				/></UiDialog>
			</template>
			<div ref="parking" class="workspace-pane-parking" aria-hidden="true" />
			<template v-if="parking">
				<Teleport
					v-for="item in definitions"
					:key="item.id"
					:to="
						(panelVisibility[item.id as WorkspacePane] ? targets[item.id] : toolTargets[item.id]) ?? parking
					"
					><div :class="['workspace-tool-slot', item.className]">
						<component :is="item.component" v-bind="item.props()" /></div
				></Teleport>
			</template>
		</div>
		<template v-for="item in tools" :key="item.id">
			<div
				v-if="config.tools[item.id]?.presentation === 'bottom'"
				v-show="toolOpen[item.id]"
				:ref="(node) => bind(item.id, node, true)"
				class="workspace-bottom-tool"
			/>
		</template>
	</section>
</template>
