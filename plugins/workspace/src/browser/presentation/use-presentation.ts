import { useWorkspaceTransfers } from '../transfers/workspace-transfers';
import { computed, watch, onScopeDispose } from 'vue';
import {
	FolderOpen,
	Keyboard,
	Zap,
	Server,
	Palette,
	PanelsTopLeft,
	GripHorizontal,
	Check,
	Square,
	SquareCheck,
	RotateCcw,
} from '@lucide/vue';
import type { PresentationContext } from './presentation-registry';
import type { WindowAction } from 'nexus-terminal/browser';
import type { NavigationItem, WorkspaceTool } from './presentation-types';
import { useWorkspaceLayout } from './use-workspace-layout';
import type { WorkspacePane } from '../../shared/workspace-layout-types';

export function usePresentation(context: () => PresentationContext) {
	const layout = useWorkspaceLayout({
		get ctx() {
			return context().ctx;
		},

		get view() {
			return context().view;
		},

		get i18n() {
			return context().i18n;
		},

		get active() {
			return context().active;
		},

		get session() {
			return context().session;
		},
	});
	const { config, toolOpen, panelVisibility, locked, loaded } = layout;
	const transfers = useWorkspaceTransfers();
	watch(
		() => transfers?.open.value,
		(open) => {
			if (open)
				for (const [id, value] of Object.entries(config.value.tools))
					if (value.presentation === 'sheet') toolOpen[id as WorkspaceTool] = false;
		},
	);

	function visible(id: WorkspaceTool) {
		return !!panelVisibility[id as WorkspacePane] || (!!config.value.tools[id] && !!toolOpen[id]);
	}

	function toggle(id: WorkspaceTool) {
		if (!loaded.value) return;
		if (transfers) transfers.open.value = false;
		if (config.value.tools[id] && !panelVisibility[id as WorkspacePane]) {
			const next = !toolOpen[id];
			if (config.value.tools[id]?.presentation === 'sheet')
				for (const [key, value] of Object.entries(config.value.tools))
					if (value.presentation === 'sheet') toolOpen[key as WorkspaceTool] = false;
			toolOpen[id] = next;
		} else if (config.value.regions.includes(id as WorkspacePane)) layout.togglePane(id as WorkspacePane);
	}

	const actions = computed<WindowAction[]>(() => {
		const c = context(),
			t = c.i18n.t;
		if (!c.active) return [];
		return [
			{
				id: 'themes',
				label: t('themes'),
				icon: Palette,
				active: !!toolOpen.themes,
				disabled: !loaded.value,
			},
			{
				id: 'layout',
				label: t('layout'),
				icon: PanelsTopLeft,
				menuTransition: 'drop',
				active: !locked.value,
				disabled: !loaded.value,
				items: [
					{
						id: 'edit',
						label: t(locked.value ? 'editLayout' : 'lockLayout'),
						icon: locked.value ? GripHorizontal : Check,
					},
					...config.value.regions
						.filter((id) => id !== config.value.primary)
						.map((id) => ({
							id: 'region:' + id,
							label: t(id),
							icon: panelVisibility[id] ? SquareCheck : Square,
						})),
					{ id: 'reset', label: t('resetLayout'), icon: RotateCcw },
				],
			},
		];
	});
	onScopeDispose(
		context().view.registerActions({
			items: actions,

			onSelect: (action, id) => {
				if (!context().active || !loaded.value) return;
				if (action === 'themes') {
					toggle('themes');
					return;
				}
				if (id === 'edit') layout.toggleLock();
				else if (id === 'reset') layout.reset();
				else if (id?.startsWith('region:')) {
					const pane = id.slice(7) as WorkspacePane;
					toolOpen[pane] = false;
					layout.togglePane(pane);
				}
			},
		}),
	);
	watch(
		() => [context().active, toolOpen.keyboard, layout.profile.value],
		() => context().input.modifiers.clear(),
	);
	const navigation = computed(() => {
		const c = context(),
			t = c.i18n.t;
		const definitions: Record<string, NavigationItem> = {
			...Object.fromEntries(
				(
					[
						['commands', Zap],
						['status', Server],
					] as const
				).map(([id, icon]) => [
					id,
					{
						id,
						label: id === 'status' ? t('status') : t('tools.' + id),
						icon,
						active: visible(id),
						disabled: !loaded.value,

						run: () => toggle(id),
					},
				]),
			),
			files: {
				id: 'files',
				label: t('files'),
				icon: FolderOpen,
				active: visible('files'),
				disabled: !loaded.value,

				run: () => toggle('files'),
			},
			keyboard: {
				id: 'keyboard',
				label: t('keyboard'),
				icon: Keyboard,
				active: visible('keyboard'),
				disabled: !loaded.value || c.transport.terminalClosed.value,

				run: () => toggle('keyboard'),
			},
		};
		return config.value.navigation.items.flatMap((id) => (definitions[id] ? [definitions[id]] : []));
	});
	return { ...layout, visible, navigation };
}
