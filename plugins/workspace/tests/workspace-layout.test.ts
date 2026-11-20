import { it, expect } from 'vitest';
import { backup } from '../src/node/workspace-storage.js';
import { WorkspaceLayoutSchema } from '../src/shared/workspace-layout-types';

const layout = () => ({
	version: 4,
	locked: true,
	dock: {
		grid: {
			width: 800,
			height: 600,
			orientation: 'HORIZONTAL',
			root: {
				type: 'branch',
				data: [
					{
						type: 'leaf',
						data: { id: 'group', views: ['terminal'], activeView: 'terminal' },
						size: 800,
					},
				],
			},
		},
		panels: { terminal: { id: 'terminal', contentComponent: 'terminal' } },
		activeGroup: 'group',
	},
});

it('validates panel references and rejects arbitrary component names', () => {
	expect(WorkspaceLayoutSchema.safeParse(layout()).success).toBe(true);
	const invalid = layout();
	invalid.dock.panels.terminal.contentComponent = 'remote-module';
	expect(WorkspaceLayoutSchema.safeParse(invalid).success).toBe(false);
	const duplicate = layout();
	duplicate.dock.grid.root.data.push(duplicate.dock.grid.root.data[0]!);
	expect(WorkspaceLayoutSchema.safeParse(duplicate).success).toBe(false);
	const missing = layout();
	missing.dock.grid.root.data[0]!.data.views = ['files'];
	expect(WorkspaceLayoutSchema.safeParse(missing).success).toBe(false);
});
it('drops runtime panel params and never persists popouts', () => {
	const input = layout();
	const parsed = WorkspaceLayoutSchema.parse({
		...input,
		dock: {
			...input.dock,
			popoutGroups: [{ url: 'https://example.test' }],
			panels: { terminal: { ...input.dock.panels.terminal, params: { sessionId: 'secret' } } },
		},
	});
	expect(parsed.dock.panels.terminal).not.toHaveProperty('params');
	expect(parsed.dock.panels.terminal).not.toHaveProperty('title');
	expect(parsed.dock).not.toHaveProperty('popoutGroups');
});
it('backs up layouts and portable preferences while keeping host trust local', () => {
	expect(backup.map(({ table }) => table)).toEqual([
		'favorites',
		'commands',
		'themes',
		'preferences',
		'background_settings',
		'background_presets',
		'background_images',
		'layouts',
		'path_history',
	]);
	expect(backup.find(({ table }) => table === 'layouts')?.keys).toEqual(['profile']);
});

it('round-trips bounded panel scales and supports layouts without a custom scale', () => {
	expect(WorkspaceLayoutSchema.parse(layout()).scales).toBeUndefined();
	expect(WorkspaceLayoutSchema.parse({ ...layout(), scales: { status: 0.65, files: 1.6 } }).scales).toEqual({
		status: 0.65,
		files: 1.6,
	});
	for (const scale of [0.1, 1.61, Infinity, NaN]) {
		expect(WorkspaceLayoutSchema.safeParse({ ...layout(), scales: { status: scale } }).success).toBe(false);
		expect(WorkspaceLayoutSchema.safeParse({ ...layout(), scales: { files: scale } }).success).toBe(false);
	}
});
