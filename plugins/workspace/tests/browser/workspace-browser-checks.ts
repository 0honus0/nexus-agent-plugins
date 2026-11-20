import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import type { startHost } from '../../../test/tests/host.js';
import { BackgroundSnapshotSchema } from '../../src/shared/workspace-background-types.js';
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
	await status.locator('.metric-row').first().click();
	await expect(status.locator('canvas')).toBeVisible();

	const files = workspace.locator('.workspace-files');
	const entry = files.getByRole('button', { name: 'file.txt', exact: true });
	await expect(entry).toBeVisible();
	await expect(files.locator('.workspace-file-tools').getByRole('button')).toHaveCount(6);
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
		expect(
			SessionListResponseSchema.parse(await host.json(base + '/sessions')).items.map((session) => session.id),
		).toEqual(ids);
	}
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
