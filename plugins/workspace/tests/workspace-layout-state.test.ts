import { taskOwner } from './fixtures/task-owner';
import { effectScope } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceLayoutSchema, type WorkspaceLayout } from '../src/shared/workspace-layout-types';
import { createWorkspaceLayoutState } from '../src/browser/presentation/workspace-layout-state';
const { request, report } = vi.hoisted(() => ({ request: vi.fn(), report: vi.fn() }));
vi.mock('../src/browser/workspace-client', () => ({
	createWorkspaceClient: () => ({ request, report }),
}));
afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

const layout = (width: number): WorkspaceLayout =>
	WorkspaceLayoutSchema.parse({
		version: 4,
		locked: true,
		dock: {
			grid: { width, height: 600, orientation: 'HORIZONTAL', root: { type: 'branch', data: [] } },
			panels: {},
		},
	});

function setup() {
	const scope = effectScope();
	const { ctx } = taskOwner();
	const shared = scope.run(() => createWorkspaceLayoutState(ctx))!;
	return { shared, scope, ctx };
}

it('shares current edits, coalesces writes and keeps each width profile independent', async () => {
	vi.useFakeTimers();
	request.mockResolvedValue(null);
	const { shared, scope } = setup();
	const a = Symbol('first-session'),
		b = Symbol('second-session');
	shared.update('compact', layout(400), a);
	shared.update('wide', layout(1200), b);
	shared.update('compact', layout(420), b);
	expect(shared.values.get('compact')?.value.dock.grid.width).toBe(420);
	expect(shared.values.get('wide')?.value.dock.grid.width).toBe(1200);
	await shared.flush();
	expect(request.mock.calls.map(([path, method, value]) => [path, method, value.dock.grid.width])).toEqual([
		['layouts/compact', 'PUT', 420],
		['layouts/wide', 'PUT', 1200],
	]);
	scope.stop();
});
it('deduplicates initial reads and does not overwrite a newer edit with an old response', async () => {
	let resolve!: (value: { layout: WorkspaceLayout }) => void;
	request.mockImplementation(
		() =>
			new Promise<{ layout: WorkspaceLayout }>((done) => {
				resolve = done;
			}),
	);
	const { shared, scope } = setup();
	const first = shared.load('compact'),
		second = shared.load('compact');
	expect(request).toHaveBeenCalledTimes(1);
	shared.update('compact', layout(450), Symbol('edit'));
	resolve({ layout: layout(400) });
	await Promise.all([first, second]);
	expect(shared.values.get('compact')?.value.dock.grid.width).toBe(450);
	request.mockResolvedValue(null);
	await shared.flush();
	scope.stop();
});

it('reuses state and serial writes across window disposal and reopening, skipping unchanged captures', async () => {
	vi.useFakeTimers();
	let release!: () => void;
	request.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	const { shared, scope, ctx } = setup();
	const original = layout(400);
	shared.update('wide', original, Symbol('first'));
	const first = shared.flush();
	await Promise.resolve();
	scope.stop();
	const secondScope = effectScope();
	const reopened = secondScope.run(() => createWorkspaceLayoutState(ctx))!;
	expect(reopened).toBe(shared);
	reopened.update('wide', layout(400), Symbol('same'));
	reopened.update('wide', layout(600), Symbol('second'));
	const second = reopened.flush();
	expect(request).toHaveBeenCalledTimes(1);
	request.mockResolvedValue(null);
	release();
	await Promise.all([first, second]);
	expect(request.mock.calls.map(([, , value]) => value.dock.grid.width)).toEqual([400, 600]);
	secondScope.stop();
});

it('reads back an ambiguous save without overwriting a later edit queued for the same profile', async () => {
	vi.useFakeTimers();
	let release!: (value: { layout: WorkspaceLayout }) => void;
	request.mockImplementationOnce(async () => {
		throw new Error('response lost');
	});
	request.mockImplementationOnce(
		() =>
			new Promise<{ layout: WorkspaceLayout }>((resolve) => {
				release = resolve;
			}),
	);
	const { shared, scope } = setup();
	shared.update('wide', layout(400), Symbol('first'));
	const first = shared.flush();
	await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
	shared.update('wide', layout(600), Symbol('later'));
	const second = shared.flush();
	request.mockResolvedValue(null);
	release({ layout: layout(400) });
	await Promise.all([first, second]);
	expect(shared.values.get('wide')?.value.dock.grid.width).toBe(600);
	expect(request.mock.calls.map(([, method]) => method)).toEqual(['PUT', undefined, 'PUT']);
	scope.stop();
});

it('evicts an unconfirmed failed layout so reopening can fetch the backend state', async () => {
	vi.useFakeTimers();
	request.mockRejectedValueOnce(new Error('save failed')).mockRejectedValueOnce(new Error('read failed'));
	const { shared, scope, ctx } = setup();
	shared.update('wide', layout(400), Symbol('first'));
	await shared.flush();
	expect(shared.values.has('wide')).toBe(false);
	scope.stop();
	request.mockResolvedValue({ layout: layout(700) });
	const reopenedScope = effectScope();
	const reopened = reopenedScope.run(() => createWorkspaceLayoutState(ctx))!;
	await reopened.load('wide');
	expect(reopened.values.get('wide')?.value.dock.grid.width).toBe(700);
	reopenedScope.stop();
});
