import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { startHost } from '../../../test/tests/host.js';
import { BackgroundSnapshotSchema } from '../../src/shared/workspace-background-types.js';
import { WorkspaceLayoutResponseSchema } from '../../src/shared/workspace-layout-types.js';
import { WorkspacePathHistorySchema } from '../../src/shared/workspace-path-history-types.js';
import { TransferTaskSchema } from '../../src/shared/workspace-transfer-types.js';
import { SessionListResponseSchema } from '../../src/shared/workspace-types.js';

type Host = Awaited<ReturnType<typeof startHost>>;

const base = '/api/plugins/' + encodeURIComponent('@nexus-terminal/workspace');

export async function verifyWorkspaceAppearance(page: Page, workspace: Locator, host: Host): Promise<void> {
	await workspace.getByRole('button', { name: 'Terminal settings', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Terminal settings', exact: true });
	const terminal = workspace.locator('.workspace-terminal-frame');
	await settings.getByRole('tab', { name: 'Colors', exact: true }).click();
	const colors = settings.locator('.workspace-theme-panel');
	await expect(colors.locator('.workspace-theme-card')).toHaveCount(403);
	await colors.getByRole('button', { name: 'Apply theme · Dracula', exact: true }).click();
	await expect(terminal).toHaveCSS('background-color', 'rgb(40, 42, 54)');

	await colors.locator('input[type=file]').setInputFiles({
		name: 'Browser audit.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify({ background: '#102030', foreground: '#eef4ff' })),
	});
	const custom = colors.locator('.workspace-theme-card').filter({ hasText: 'Browser audit' });
	await custom.getByRole('button', { name: 'Apply theme · Browser audit', exact: true }).click();
	await expect(terminal).toHaveCSS('background-color', 'rgb(16, 32, 48)');
	const theme = page.waitForEvent('download');
	await custom.getByRole('button', { name: 'Export theme', exact: true }).click();
	expect(JSON.parse(await readFile((await (await theme).path())!, 'utf8'))).toMatchObject({
		name: 'Browser audit',
		colors: { background: '#102030', foreground: '#eef4ff' },
	});

	await settings.getByRole('tab', { name: 'Background', exact: true }).click();
	await expect(settings.getByRole('button', { name: /Apply background · /u })).toHaveCount(20);
	await settings.getByRole('button', { name: 'Apply background · Ribbons', exact: true }).click();
	await expect(terminal.locator('iframe.workspace-background-frame')).toHaveAttribute('sandbox', 'allow-scripts');
	const html = '<div>Browser audit background</div>';
	await settings.locator('input[type=file][accept*=".html"]').setInputFiles({
		name: 'Browser audit.html',
		mimeType: 'text/html',
		buffer: Buffer.from(html),
	});
	const editor = page.getByRole('dialog', { name: 'New background', exact: true });
	await editor.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(editor).toHaveCount(0);
	await settings.getByRole('button', { name: 'Apply background · Browser audit', exact: true }).click();
	await expect(
		terminal.frameLocator('iframe.workspace-background-frame').getByText('Browser audit background'),
	).toBeVisible();
	await expect
		.poll(async () => BackgroundSnapshotSchema.parse(await host.json(base + '/appearance')).settings.enabled)
		.toBe(true);
	const background = page.waitForEvent('download');
	await settings.getByRole('button', { name: 'Export background · Browser audit', exact: true }).click();
	expect(await readFile((await (await background).path())!, 'utf8')).toBe(html);
	await settings.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(settings).toHaveCount(0);
}

export async function verifyWorkspacePanels(page: Page, workspace: Locator, host: Host): Promise<void> {
	const status = workspace.locator('.workspace-status-panel');
	await expect(status).toContainText('Server status');
	await expect(status.locator('.metric-row')).toHaveCount(5);
	const metricTrack = status.locator('.metric-track').first();
	const originalStyle = await status.evaluate((element) => {
		const previous = { width: element.style.width, height: element.style.height };
		element.style.width = '250px';
		element.style.height = '310px';
		return previous;
	});
	await expect(metricTrack).toBeVisible();
	const gaps = await status.locator('.metric-row:not(.network-row)').evaluateAll((rows) =>
		rows.map((row) => {
			const header = row.querySelector('.metric-topline')!.getBoundingClientRect();
			const track = row.querySelector('.metric-track')!.getBoundingClientRect();
			return track.top - header.bottom;
		}),
	);
	for (const gap of gaps) expect(gap).toBeCloseTo(9, 0);
	await status.evaluate((element) => {
		element.style.height = '240px';
	});
	await expect(metricTrack).toBeVisible();
	await status.evaluate((element) => {
		element.style.width = '200px';
	});
	await expect(metricTrack).toBeVisible();

	const statusViewport = workspace.locator('.workspace-status-viewport');
	for (let index = 0; index < 2; index++)
		await statusViewport.dispatchEvent('wheel', { ctrlKey: true, deltaY: -250 });
	await expect(status).toHaveAttribute('data-status-scale', '1.60');
	await status.evaluate((element) => {
		Object.assign(element.style, { width: '184px', height: '260px' });
	});
	await expect(metricTrack).toBeVisible();
	await status.evaluate((element) => {
		Object.assign(element.style, { width: '500px', height: '205px' });
	});
	await expect(metricTrack).toBeHidden();
	await status.evaluate((element) => {
		Object.assign(element.style, { width: '112px', height: '240px' });
	});
	await expect(metricTrack).toBeVisible();
	await expect(status.locator('.metric-icon').first()).toBeHidden();
	for (let index = 0; index < 2; index++) await statusViewport.dispatchEvent('wheel', { ctrlKey: true, deltaY: 250 });
	await expect(status).toHaveAttribute('data-status-scale', '1.00');
	await status.evaluate((element, styles) => Object.assign(element.style, styles), originalStyle);
	await status.locator('.metric-row').first().click();
	await expect(status.locator('canvas')).toBeVisible();

	const layout = workspace.getByRole('button', { name: 'Layout', exact: true });
	await layout.click();
	await page.getByRole('menuitem', { name: 'Edit layout', exact: true }).click();
	await expect(workspace.locator('.dv-full-width-single-tab .workspace-pane-grip').first()).toBeVisible();
	await layout.click();
	await page.getByRole('menuitem', { name: 'Finish editing', exact: true }).click();
	await expect(workspace.locator('.workspace-pane-grip')).toHaveCount(0);

	const files = workspace.locator('.workspace-files');
	const entry = files.getByRole('button', { name: 'file.txt', exact: true });
	await expect(entry).toBeVisible();
	const list = files.locator('.workspace-file-list');
	const folder = files.getByRole('button', { name: 'prefetch-fixture', exact: true });
	const prefetchedFile = files.getByRole('button', { name: 'prefetched.txt', exact: true });
	await expect(entry.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/u);
	await expect(folder.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/u);
	const releaseDirectory = Promise.withResolvers<void>();

	const history = async () => WorkspacePathHistorySchema.parse(await host.json(base + '/path-history')).paths;

	await expect.poll(history).toEqual(['/']);
	let reads = 0;
	const directoryRequests = '**/directory?*';
	await page.route(directoryRequests, async (route) => {
		if (new URL(route.request().url()).searchParams.get('path') === '/prefetch-fixture') {
			reads++;
			await releaseDirectory.promise;
		}
		await route.continue();
	});
	try {
		await folder.hover();
		await expect.poll(() => reads).toBe(1);
		await expect(list).toHaveAttribute('aria-busy', 'false');
		expect(await history()).toEqual(['/']);
		await folder.click();
		await expect(list).toHaveAttribute('aria-busy', 'true');
		releaseDirectory.resolve();
		await expect(prefetchedFile).toBeVisible();
		expect(reads).toBe(1);
		await expect.poll(history).toEqual(['/prefetch-fixture', '/']);

		const parent = files.getByRole('button', { name: 'Parent directory', exact: true });
		await parent.click();
		await folder.click();
		await expect(prefetchedFile).toBeVisible();
		expect(reads).toBe(1);
		await files.getByRole('button', { name: 'Refresh directory', exact: true }).click();
		await expect.poll(() => reads).toBe(2);
		await parent.click();
		await expect(entry).toBeVisible();
	} finally {
		releaseDirectory.resolve();
		await page.unroute(directoryRequests);
	}
	const address = files.getByRole('combobox', { name: 'Remote path' });
	const historyButton = files.getByRole('button', { name: 'Path history', exact: true });
	const historyList = page.getByRole('listbox', { name: 'Path history', exact: true });
	const savedFolder = historyList.getByRole('option', { name: '/prefetch-fixture', exact: true });
	await address.click();
	await address.fill('prefetch');
	await expect(savedFolder).toBeVisible();
	const fieldBounds = (await files.locator('.workspace-path-field').boundingBox())!;
	const historyBounds = (await page.locator('.workspace-path-history').boundingBox())!;
	expect(historyBounds.x).toBeCloseTo(fieldBounds.x, 0);
	expect(historyBounds.width).toBeCloseTo(fieldBounds.width, 0);
	await expect(historyList.getByRole('option')).toHaveCount(1);
	await address.press('ArrowDown');
	await expect(savedFolder).toHaveAttribute('aria-selected', 'true');
	await address.press('Enter');
	await expect(prefetchedFile).toBeVisible();
	await expect.poll(history).toEqual(['/prefetch-fixture', '/']);
	await files.getByRole('button', { name: 'Parent directory', exact: true }).click();
	await expect(entry).toBeVisible();
	await historyButton.click();
	await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
	await savedFolder.click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Copy path', exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/prefetch-fixture');
	await savedFolder.click({ button: 'right' });
	const removal = page.waitForResponse(
		(response) =>
			response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith('/path-history'),
	);
	await page.getByRole('menuitem', { name: 'Remove from history', exact: true }).click();
	const removed = await removal;
	expect(removed.status(), await removed.text()).toBe(204);
	await expect(savedFolder).toHaveCount(0);
	await expect.poll(history).toEqual(['/']);
	await historyButton.click();
	await expect(folder).toBeVisible();
	const toolbar = files.locator('.workspace-file-tools');
	await expect(toolbar.getByRole('button')).toHaveCount(7);
	for (const name of [
		'Refresh directory',
		'Search this folder and subfolders',
		'Sort files',
		'Show hidden files',
		'Change terminal to this directory',
		'Follow terminal directory',
		'Favorite paths',
	]) {
		await expect(toolbar.getByRole('button', { name, exact: true })).toHaveAttribute('title', name);
	}
	const favorites = toolbar.getByRole('button', { name: 'Favorite paths' });
	const manageFavorites = page.getByRole('dialog', { name: 'Favorite paths' });
	await favorites.click();
	await page.getByRole('menuitem', { name: 'Fixture path', exact: true }).click();
	await expect(prefetchedFile).toBeVisible();
	await expect(manageFavorites).toHaveCount(0);
	await favorites.click();
	await page.getByRole('menuitem', { name: 'Manage favorite paths', exact: true }).click();
	await expect(manageFavorites).toBeVisible();
	await manageFavorites.getByRole('button', { name: 'Close', exact: true }).click();
	await files.getByRole('button', { name: 'Parent directory', exact: true }).click();
	await expect(entry).toBeVisible();
	const fileSize = entry.locator('.workspace-file-size');
	await expect(fileSize).toBeVisible();
	await files.evaluate((element) => {
		element.style.maxWidth = '250px';
	});
	await expect(fileSize).toBeHidden();
	await expect(entry).toBeVisible();
	await files.evaluate((element) => element.style.removeProperty('max-width'));
	await entry.click();
	const listBounds = (await list.boundingBox())!;
	await list.dispatchEvent('contextmenu', {
		button: 2,
		clientX: listBounds.x + 16,
		clientY: listBounds.y + listBounds.height - 8,
	});
	await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeDisabled();
	await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeDisabled();
	await expect(page.getByRole('menuitem', { name: 'New file', exact: true })).toBeEnabled();
	await page.keyboard.press('Escape');
	const fileRow = (await entry.boundingBox())!;
	await entry.dispatchEvent('pointerdown', {
		pointerType: 'touch',
		pointerId: 9,
		button: 0,
		buttons: 1,
		clientX: fileRow.x + 12,
		clientY: fileRow.y + 8,
	});
	await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeVisible();
	await entry.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 9, button: 0 });
	await page.keyboard.press('Escape');

	await entry.hover();
	await page.mouse.wheel(0, -90);
	await expect(list).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
	await page.keyboard.down('Control');
	try {
		await page.mouse.wheel(0, -90);
	} finally {
		await page.keyboard.up('Control');
	}
	await expect(list).toHaveCSS('transform', 'matrix(1.1, 0, 0, 1.1, 0, 0)');
	await expect.poll(async () => (await entry.boundingBox())!.height).toBeGreaterThan(fileRow.height);
	const profile = await workspace.locator('.workspace-surface').getAttribute('data-profile');
	await expect
		.poll(
			async () =>
				WorkspaceLayoutResponseSchema.parse(await host.json(base + '/layouts/' + profile)).layout?.scales
					?.files,
		)
		.toBe(1.1);

	const ids = SessionListResponseSchema.parse(await host.json(base + '/sessions')).items.map((session) => session.id);
	const divider = workspace
		.locator('.dv-split-view-container.dv-horizontal > .dv-sash-container > .dv-sash:visible')
		.first();
	const pane = workspace.locator('.workspace-terminal-slot');
	const before = (await pane.boundingBox())!.width;
	const bounds = (await divider.boundingBox())!;
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width / 2 + 38, bounds.y + bounds.height / 2, { steps: 8 });
	await page.mouse.up();
	await expect.poll(async () => Math.abs((await pane.boundingBox())!.width - before)).toBeGreaterThan(5);
	for (const width of [470, 1600]) {
		await page.setViewportSize({ width, height: 1000 });
		await expect(workspace.locator('.xterm')).toBeVisible();
		if (width === 470) {
			await workspace.getByRole('button', { name: 'Files', exact: true }).click();
			const sheet = page.getByRole('dialog', { name: 'Files', exact: true });
			await sheet.getByRole('button', { name: 'Path history', exact: true }).click();
			await sheet.getByRole('option', { name: '/', exact: true }).click();
			await expect(sheet.getByRole('combobox', { name: 'Remote path' })).toHaveValue('/');
			await sheet.getByRole('button', { name: 'Close', exact: true }).click();
		}
		expect(
			SessionListResponseSchema.parse(await host.json(base + '/sessions')).items.map((session) => session.id),
		).toEqual(ids);
	}
	await expect(list).toHaveCSS('transform', 'matrix(1.1, 0, 0, 1.1, 0, 0)');
}

export async function verifyTerminalSelection(workspace: Locator): Promise<void> {
	const terminal = workspace.locator('.workspace-terminal');
	const row = terminal.locator('.xterm-rows > div').filter({ hasText: 'audit selectable' }).first();
	await expect(row).toBeVisible();
	const { x, y, height } = (await row.boundingBox())!;
	await terminal.evaluate(
		(element, point) => {
			const touch = { identifier: 1, target: element, clientX: point.x, clientY: point.y };
			const event = new Event('touchstart', { bubbles: true, cancelable: true });
			Object.defineProperties(event, {
				touches: { value: [touch] },
				targetTouches: { value: [touch] },
				changedTouches: { value: [touch] },
			});
			element.dispatchEvent(event);
		},
		{ x: x + 10, y: y + height / 2 },
	);
	await expect(workspace.getByRole('button', { name: 'Adjust selection start', exact: true })).toBeVisible();
	await terminal.evaluate((element) => {
		const event = new Event('touchend', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'touches', { value: [] });
		element.dispatchEvent(event);
	});
	await expect(workspace.getByRole('button', { name: 'Copy selection', exact: true })).toBeEnabled();
	await workspace.getByRole('button', { name: 'Clear selection', exact: true }).click();
}

export async function verifyWorkspaceTransfers(
	page: Page,
	workspace: Locator,
	fixture: {
		sourceId: string;
		destinationId: string;
		directory: string;
		readStarted: Promise<void>;
		releaseRead: () => void;
	},
): Promise<void> {
	const start = async (name: string) => {
		const response = await page.request.post(
			new URL(base + '/sessions/' + fixture.destinationId + '/files/transfer', page.url()).href,
			{
				data: {
					sourceSessionId: fixture.sourceId,
					paths: ['/' + name],
					destination: '/',
					move: false,
					overwrite: false,
				},
			},
		);
		expect(response.status()).toBe(202);
		return TransferTaskSchema.parse(await response.json());
	};

	await workspace.getByRole('button', { name: 'Transfers', exact: true }).click();
	const center = page.getByRole('dialog', { name: /^Transfers(?:\s*\d+)?$/u });
	await start('file.txt');
	await center.getByRole('tab', { name: 'History', exact: true }).click();
	await expect(
		center.locator('.workspace-transfer-task[data-state="completed"]').filter({ hasText: 'file.txt' }),
	).toBeVisible();
	expect(await readFile(join(fixture.directory, 'file.txt'), 'utf8')).toBe('example file');

	await center.getByRole('tab', { name: 'Active', exact: true }).click();
	try {
		const task = await start('blocked.txt');
		const pending = center.locator('.workspace-transfer-task').filter({ hasText: 'blocked.txt' });
		let reading = false;
		void fixture.readStarted.then(() => {
			reading = true;
		});
		await expect.poll(() => reading).toBe(true);
		await pending.getByRole('button', { name: 'Task actions', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Cancel transfer', exact: true }).click();
		const confirmation = page.getByRole('dialog', { name: 'Cancel transfer?', exact: true });
		const canceled = page.waitForResponse((response) =>
			response.url().endsWith('/transfers/' + task.id + '/cancel'),
		);
		await confirmation.getByRole('button', { name: 'Cancel transfer', exact: true }).click();
		expect((await canceled).status()).toBe(204);
	} finally {
		fixture.releaseRead();
	}

	await center.getByRole('tab', { name: 'History', exact: true }).click();
	await expect(
		center.locator('.workspace-transfer-task[data-state="canceled"]').filter({ hasText: 'blocked.txt' }),
	).toBeVisible();
	await expect(readFile(join(fixture.directory, 'blocked.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
	await center.getByRole('button', { name: 'Collapse', exact: true }).click();
}
