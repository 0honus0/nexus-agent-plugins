import type { Component } from 'vue';
import type { WorkspacePane, WorkspaceTool } from '../../shared/workspace-layout-types';

export type { WorkspaceTool } from '../../shared/workspace-layout-types';

export interface PresentationProfile {
	regions: WorkspacePane[];
	initialRegions?: WorkspacePane[];
	primary: WorkspacePane;
	direction: 'right' | 'below';
	positions?: Partial<
		Record<
			WorkspacePane,
			{
				reference: WorkspacePane;
				direction: 'left' | 'right' | 'above' | 'below';
				width?: number;
				height?: number;
			}
		>
	>;
	tools: Partial<
		Record<WorkspaceTool, { presentation: 'sheet' | 'bottom'; defaultOpen: boolean; remember?: boolean }>
	>;
	navigation: { placement: 'side' | 'bottom'; display: 'icon' | 'icon-label'; items: string[] };
}

export interface PresentationItem {
	id: WorkspaceTool;
	kind: 'region' | 'tool';
	component: Component;
	className?: string;
	props: () => Record<string, unknown>;
}

export interface NavigationItem {
	id: string;
	label: string;
	icon: Component;
	disabled?: boolean;
	active?: boolean;
	loading?: boolean;
	run: () => void;
	items?: { id: string; label: string; icon?: Component }[];
	select?: (id: string) => void;
}
