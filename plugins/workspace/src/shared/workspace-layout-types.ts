import { z } from 'zod';
import type { SerializedDockview } from 'dockview-vue';
import { LayoutProfileSchema } from './layout-types';

export const WorkspacePaneSchema = z.enum(['terminal', 'files', 'commands', 'status']);

export type WorkspacePane = z.infer<typeof WorkspacePaneSchema>;

export const WorkspaceToolSchema = WorkspacePaneSchema.or(z.enum(['keyboard', 'themes']));

export type WorkspaceTool = z.infer<typeof WorkspaceToolSchema>;

export const workspacePaneScale = { min: 0.65, max: 1.6, step: 0.1 } as const;

const PaneScaleSchema = z.number().finite().min(workspacePaneScale.min).max(workspacePaneScale.max);

const PanelSchema = z.object({
	id: WorkspacePaneSchema,
	contentComponent: WorkspacePaneSchema,
	renderer: z.enum(['always', 'onlyWhenVisible']).optional(),
});

const GroupSchema = z.object({
	id: z.string().min(1).max(100),
	views: z.array(WorkspacePaneSchema).max(4),
	activeView: WorkspacePaneSchema.optional(),
	hideHeader: z.boolean().optional(),
});

/** Persist only docked panes owned by Workspace. No component URLs, session ids, params, floating windows or credentials. */
export const WorkspaceDockSchema = z
	.object({
		grid: z.object({
			root: z.json(),
			width: z.number().finite().nonnegative(),
			height: z.number().finite().nonnegative(),
			orientation: z.enum(['HORIZONTAL', 'VERTICAL']),
		}),
		panels: z.partialRecord(WorkspacePaneSchema, PanelSchema),
		activeGroup: z.string().max(100).optional(),
	})
	.superRefine((value, ctx) => {
		const seen = new Set<string>();
		const groups = new Set<string>();

		function visit(node: unknown, depth: number): boolean {
			if (depth > 8) return false;
			const parsed = z
				.object({
					type: z.enum(['branch', 'leaf']),
					data: z.unknown(),
					size: z.number().finite().nonnegative().optional(),
					visible: z.boolean().optional(),
				})
				.strict()
				.safeParse(node);
			if (!parsed.success) return false;
			const n = parsed.data;
			if (n.type === 'branch')
				return Array.isArray(n.data) && n.data.length <= 4 && n.data.every((child) => visit(child, depth + 1));
			const group = GroupSchema.strict().safeParse(n.data);
			if (!group.success || groups.has(group.data.id)) return false;
			groups.add(group.data.id);
			if (group.data.activeView && !group.data.views.includes(group.data.activeView)) return false;
			return group.data.views.every((id) => {
				if (seen.has(id) || !value.panels[id]) return false;
				seen.add(id);
				return true;
			});
		}

		if (
			!visit(value.grid.root, 0) ||
			Object.keys(value.panels).some((id) => !seen.has(id)) ||
			Object.entries(value.panels).some(([id, p]) => p?.id !== id || p.contentComponent !== id) ||
			(value.activeGroup && !groups.has(value.activeGroup))
		)
			ctx.addIssue({ code: 'custom', message: 'WORKSPACE_LAYOUT_INVALID' });
	})
	.transform((value) => value as unknown as SerializedDockview);

const PaneScalesSchema = z.object({ status: PaneScaleSchema.optional(), files: PaneScaleSchema.optional() });

export const WorkspaceLayoutSchema = z.object({
	version: z.literal(4),
	tools: z.partialRecord(WorkspaceToolSchema, z.boolean()).optional(),
	/** Per-width-profile presentation choices. */
	scales: PaneScalesSchema.optional(),
	locked: z.boolean(),
	dock: WorkspaceDockSchema,
});

export type WorkspaceLayout = z.infer<typeof WorkspaceLayoutSchema>;

export const WorkspaceLayoutResponseSchema = z.object({ layout: WorkspaceLayoutSchema.nullable() });

export const WorkspaceSessionPresentationSchema = z.partialRecord(
	LayoutProfileSchema,
	z.object({
		sizes: z
			.record(z.string().max(48), z.number().min(0).max(1))
			.refine((sizes) => Object.keys(sizes).length <= 32),
		scales: PaneScalesSchema.extend({ terminal: z.number().min(8).max(40).optional() }),
	}),
);

export type WorkspaceSessionPresentation = z.infer<typeof WorkspaceSessionPresentationSchema>;
