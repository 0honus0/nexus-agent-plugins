import { panePresentationKey } from './pane-presentation';
import { paneSizes } from './pane-sizes';
import { presentationProfiles } from './presentation-defaults';
import type { PresentationProfile } from './presentation-types';
import { ref, shallowRef, watch, onScopeDispose, computed, reactive, inject, provide } from 'vue';
import type { DockviewApi, DockviewReadyEvent } from 'dockview-vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import type { PluginWindowApi } from 'nexus-terminal/browser';
import { resolveLayoutProfile } from '../layout-profile.js';
import type { LayoutProfile } from '../../shared/layout-types.js';
import {
	WorkspaceLayoutSchema,
	type WorkspaceLayout,
	type WorkspacePane,
	type WorkspaceSessionPresentation,
	type WorkspaceTool,
} from '../../shared/workspace-layout-types';
import type { SessionInfo } from '../../shared/workspace-types';
import type { WorkspaceI18n } from '../workspace-i18n';
import { createWorkspaceClient } from '../workspace-client';
import { workspaceLayoutStateKey } from './workspace-layout-state';
import { dockSizes, dockStructure, withDockSizes } from './dock-layout';

export function useWorkspaceLayout(props: {
	ctx: PluginContextApi;
	view: PluginWindowApi;
	i18n: WorkspaceI18n;
	active: boolean;
	session: SessionInfo;
}) {
	const api = shallowRef<DockviewApi>();
	const minimumSize = reactive({ width: 0, height: 0 });
	const scales = reactive<Partial<Record<WorkspacePane, number>>>({});
	const presentation: WorkspaceSessionPresentation = { ...props.session.presentation };
	const viewport = { width: 0, height: 0 };

	provide(panePresentationKey, {
		scales,

		changed: () => {
			if (props.active) capture();
		},
	});

	/** Dockview constrains grid groups. panel.api.setConstraints is inherited but does
	 * not update Dockview's panel minima at runtime; restored group records must be
	 * replaced through group.api. Reapply after moving a pane and changing headers.
	 */
	function syncConstraints() {
		if (!api.value || applyingConstraints) return;
		applyingConstraints = true;
		try {
			const resolved = paneSizes;
			for (const group of api.value.groups) {
				const pane = group.activePanel;
				if (!pane || !(pane.id in resolved)) continue;
				const minimum = resolved[pane.id as WorkspacePane];
				const headerHeight = group.header.hidden ? 0 : Math.max(0, group.api.height - pane.api.height);
				const minimumHeight = minimum.minimumHeight + headerHeight;
				if (group.minimumWidth !== minimum.minimumWidth || group.minimumHeight !== minimumHeight)
					group.api.setConstraints({ ...minimum, minimumHeight });
			}
		} finally {
			applyingConstraints = false;
			updateMinimumSize();
		}
	}

	function updateMinimumSize() {
		minimumSize.width = api.value?.minimumWidth ?? 0;
		minimumSize.height = api.value?.minimumHeight ?? 0;
	}

	const profile = ref<LayoutProfile>('compact');
	const config = computed<PresentationProfile>(() => presentationProfiles[profile.value]);
	const toolOpen = reactive<Partial<Record<WorkspaceTool, boolean>>>({});
	const panelVisibility = reactive<Partial<Record<WorkspacePane, boolean>>>({});
	const locked = ref(true),
		loaded = ref(false);
	const { report } = createWorkspaceClient(props.ctx, props.ctx.signal);
	const shared = inject(workspaceLayoutStateKey)!;
	const owner = Symbol('layout-surface');
	let generation = 0,
		restoring = false,
		applyingConstraints = false,
		disposed = false;
	let currentProfile: LayoutProfile | undefined;
	let currentStructure: string | undefined;
	let appliedLayout: WorkspaceLayout | undefined;
	const subscriptions: ReturnType<DockviewApi['onDidLayoutChange']>[] = [];
	const panelSubscriptions = new Map<string, ReturnType<DockviewApi['onDidLayoutChange']>>();

	function clearPanels() {
		for (const sub of panelSubscriptions.values()) sub.dispose();
		panelSubscriptions.clear();
	}

	const visible = () => {
		const visibleIds = new Set(api.value?.panels.filter((panel) => panel.api.isVisible).map((panel) => panel.id));
		for (const id of Object.keys(paneSizes) as WorkspacePane[]) panelVisibility[id] = visibleIds.has(id);
	};

	function rememberedTools(profile: LayoutProfile): WorkspaceLayout['tools'] {
		const currentConfig: PresentationProfile = presentationProfiles[profile];
		return Object.fromEntries(
			Object.entries(currentConfig.tools)
				.filter(([, options]) => options.remember)
				.map(([id]) => [id, !!toolOpen[id as WorkspaceTool]]),
		);
	}

	function capture() {
		if (
			!api.value ||
			!api.value.width ||
			!api.value.height ||
			!loaded.value ||
			restoring ||
			!currentProfile ||
			disposed
		)
			return;
		try {
			const dock = api.value.toJSON();
			presentation[currentProfile] = {
				sizes: { ...presentation[currentProfile]?.sizes, ...dockSizes(dock) },
				scales: { ...scales },
			};
			const tools = rememberedTools(currentProfile);
			const structure = dockStructure(dock, tools);
			if (structure === currentStructure) return;
			const value = WorkspaceLayoutSchema.parse({
				version: 4,
				scales: shared.values.get(currentProfile)?.value.scales,
				tools,
				locked: true,
				dock,
			});
			currentStructure = structure;
			shared.update(currentProfile, value, owner);
			appliedLayout = shared.values.get(currentProfile)?.value;
		} catch (cause) {
			report(cause);
		}
	}

	onScopeDispose(
		shared.registerSession(props.session.id, () => {
			if (props.active) capture();
			return { ...presentation };
		}),
	);

	function add(id: WorkspacePane) {
		const dock = api.value;
		if (!dock) return;
		const existing = dock.getPanel(id);
		if (existing) {
			existing.api.setActive();
			return;
		}
		const position = config.value.positions?.[id];
		const reference = (position && dock.getPanel(position.reference)) || dock.panels[0];
		const panel = dock.addPanel({
			id,
			component: id,
			title: props.i18n.t(id),
			renderer: 'always',
			...paneSizes[id],
			...(position?.width
				? { initialWidth: Math.max(paneSizes[id].minimumWidth, dock.width * position.width) }
				: {}),
			...(position?.height
				? { initialHeight: Math.max(paneSizes[id].minimumHeight, dock.height * position.height) }
				: {}),
			...(reference
				? {
						position: {
							referencePanel: reference.id,
							direction: position?.direction ?? config.value.direction,
						},
					}
				: {}),
		});
		panel.group.header.hidden = locked.value;
		syncConstraints();
		panelSubscriptions.get(panel.id)?.dispose();
		panelSubscriptions.set(panel.id, panel.api.onDidVisibilityChange(visible));
		visible();
	}

	function defaults() {
		const dock = api.value;
		if (!dock) return;
		clearPanels();
		dock.clear();
		for (const id of config.value.initialRegions ?? config.value.regions) add(id);
		dock.getPanel(config.value.primary)?.api.setActive();
	}

	async function restore() {
		if (!api.value || disposed || !props.active || !viewport.width || !viewport.height) return;
		const target = profile.value;
		if (loaded.value && currentProfile === target && appliedLayout === shared.values.get(target)?.value) return;
		const token = ++generation;
		loaded.value = false;
		restoring = true;
		await shared.load(target);
		const saved = shared.values.get(target)?.value;

		if (disposed || token !== generation || !props.active) return;
		currentProfile = target;
		appliedLayout = saved;
		const local = presentation[target];
		for (const id of Object.keys(scales) as WorkspacePane[]) delete scales[id];
		Object.assign(scales, local?.scales ?? saved?.scales ?? {});
		// Editing is temporary UI state; reopening a session always uses normal mode.
		locked.value = true;
		// Restore persisted tools per profile; transient tools keep their live state and drafts.
		for (const id of Object.keys(toolOpen) as WorkspaceTool[]) if (!config.value.tools[id]) delete toolOpen[id];
		for (const [id, options] of Object.entries(config.value.tools)) {
			const tool = id as WorkspaceTool;
			toolOpen[tool] = options.remember
				? (saved?.tools?.[tool] ?? options.defaultOpen)
				: (toolOpen[tool] ?? options.defaultOpen);
		}
		try {
			// Mounting or re-showing a tab can leave Dockview at 0×0 until its own observer runs.
			// fromJSON fits the saved grid to the current viewport, so give it usable bounds first.
			api.value.layout(
				Math.max(viewport.width, api.value.minimumWidth),
				Math.max(viewport.height, api.value.minimumHeight),
			);
			if (!saved) defaults();
			const dock = saved?.dock ?? (local && api.value.toJSON());
			if (dock) {
				clearPanels();
				api.value.fromJSON(local ? withDockSizes(dock, local.sizes) : dock);
				// Earlier layouts could hide panes or combine them behind a tab bar.
				if (
					!api.value.getPanel(config.value.primary) ||
					api.value.groups.some((group) => group.panels.length !== 1)
				)
					defaults();
				for (const panel of [...api.value.panels])
					if (!config.value.regions.includes(panel.id as WorkspacePane)) panel.api.close();
				for (const group of api.value.groups) group.header.hidden = locked.value;
				for (const panel of api.value.panels) {
					panelSubscriptions.set(panel.id, panel.api.onDidVisibilityChange(visible));
				}
			}
		} catch (cause) {
			report(cause);
			defaults();
		}
		for (const panel of api.value.panels) panel.api.setTitle(props.i18n.t(panel.id));
		api.value.updateOptions({ locked: false, disableDnd: locked.value });
		visible();
		syncConstraints();
		currentStructure = dockStructure(api.value.toJSON(), rememberedTools(target));
		restoring = false;
		loaded.value = true;
	}

	function ready(event: DockviewReadyEvent) {
		api.value = event.api;
		subscriptions.push(
			event.api.onDidAddGroup((group) => {
				group.header.hidden = locked.value;
			}),
		);
		subscriptions.push(
			event.api.onWillDrop((event) => {
				if (locked.value || event.position === 'center' || event.getData()?.viewId !== api.value?.id)
					event.preventDefault();
			}),
		);
		subscriptions.push(
			event.api.onDidLayoutChange(({ reasons }) => {
				if (applyingConstraints) return;
				syncConstraints();
				visible();
				if (props.active && (reasons.has('geometry') || reasons.has('structure'))) capture();
			}),
		);
		void restore();
	}

	function resize(width: number) {
		if (width <= 0) return;
		const next = resolveLayoutProfile(width);
		if (next !== profile.value) {
			if (props.active) capture();
			profile.value = next;
		}
	}

	function resizeViewport(width: number, height: number) {
		const next = { width: Math.round(width), height: Math.round(height) };
		if (next.width <= 0 || next.height <= 0 || (next.width === viewport.width && next.height === viewport.height))
			return;
		Object.assign(viewport, next);
		syncConstraints();
		if (!loaded.value && !restoring) void restore();
	}

	watch(profile, () => void restore());
	watch(
		() => props.active,
		(active) => {
			if (active) void restore();
			else {
				capture();
				generation++;
				restoring = false;
			}
		},
	);
	watch(
		() => shared.values.get(profile.value),
		(entry) => {
			if (entry?.owner !== owner && props.active) void restore();
		},
	);
	watch(
		() => props.i18n.t('terminal'),
		() => {
			if (!api.value) return;
			restoring = true;
			for (const panel of api.value.panels) panel.api.setTitle(props.i18n.t(panel.id));
			restoring = false;
		},
	);

	function toggleLock() {
		locked.value = !locked.value;
		for (const group of api.value?.groups ?? []) group.header.hidden = locked.value;
		syncConstraints();
		api.value?.updateOptions({ locked: false, disableDnd: locked.value });
		capture();
	}

	function reset() {
		restoring = true;
		if (currentProfile) delete presentation[currentProfile];
		defaults();
		restoring = false;
		capture();
	}

	function togglePane(id: WorkspacePane) {
		if (!loaded.value || !config.value.regions.includes(id)) return;
		const panel = api.value?.getPanel(id);
		if (panel && id !== config.value.primary) {
			panel.api.close();
			panelSubscriptions.get(id)?.dispose();
			panelSubscriptions.delete(id);
		} else add(id);
		visible();
		capture();
	}

	watch(toolOpen, () => {
		if (props.active) capture();
	});

	const off = props.view.onBeforeClose(() => {
		if (props.active) capture();
		props.ctx.app.tasks.background('save-workspace-layout', shared.flush);
	});
	onScopeDispose(() => {
		if (props.active) capture();
		props.ctx.app.tasks.background('save-workspace-layout', shared.flush);
		disposed = true;
		generation++;
		off();
		clearPanels();
		for (const sub of subscriptions) sub.dispose();
	});
	return {
		config,
		minimumSize,
		toolOpen,
		togglePane,
		api,
		profile,
		locked,
		loaded,
		panelVisibility,
		ready,
		resize,
		resizeViewport,
		toggleLock,
		reset,
	};
}
