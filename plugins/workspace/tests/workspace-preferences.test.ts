import { taskOwner } from './fixtures/task-owner';
import { effectScope } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceCatalogSchema } from '../src/shared/workspace-catalog-types';
import { createWorkspaceCatalog } from '../src/browser/catalog/workspace-catalog';

const { request, report } = vi.hoisted(() => ({ request: vi.fn(), report: vi.fn() }));
vi.mock('../src/browser/workspace-client', () => ({ createWorkspaceClient: () => ({ request, report }) }));

afterEach(() => {
	vi.clearAllMocks();
});

it('saves coalesced field changes after the submitting window is disposed', async () => {
	const saved = WorkspaceCatalogSchema.parse({
		favorites: [],
		commands: [],
		themes: [],
		preferences: { theme: null, version: 2 },
	});
	request.mockImplementation(async (_path, method, data) =>
		method === 'PUT' ? { ...saved, preferences: { ...data, version: data.version + 1 } } : saved,
	);
	const { ctx } = taskOwner();
	const scope = effectScope();
	const controller = new AbortController();
	const catalog = scope.run(() => createWorkspaceCatalog(ctx))!;
	try {
		await vi.waitFor(() => expect(catalog.loaded.value).toBe(true));
		const font = catalog.preferences({ display: { fontFamily: 'Settings Mono' } });
		const stroke = catalog.preferences({ display: { stroke: { enabled: true } } });
		expect(catalog.display.value).toMatchObject({ fontFamily: 'Settings Mono', stroke: { enabled: true } });
		controller.abort();
		scope.stop();
		await expect(Promise.all([font, stroke])).resolves.toEqual([true, true]);
		expect(request).toHaveBeenLastCalledWith(
			'catalog/preferences',
			'PUT',
			expect.objectContaining({
				version: 2,
				display: expect.objectContaining({
					fontFamily: 'Settings Mono',
					stroke: expect.objectContaining({ enabled: true }),
				}),
			}),
			WorkspaceCatalogSchema,
		);
		expect(catalog.state.value.preferences.version).toBe(3);
		expect(report).not.toHaveBeenCalled();
	} finally {
		scope.stop();
	}
});
