import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium, expect, type Page } from '@playwright/test';
import { HttpProblemSchema } from 'nexus-terminal/browser';
import { WebSocket } from 'ws';
import { z } from 'zod';
import manifest from '../package.json' with { type: 'json' };
import provider from './fixtures/provider/package.json' with { type: 'json' };
import { backupPath, manager, pluginPath, providerPath, setEnabled, startHost, uninstall, until } from './host.js';

const Revision = z.object({ revision: z.number() });
const Items = z.object({ items: z.array(Revision.extend({ id: z.string() })) });

async function exerciseGallery(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'SDK UI gallery', exact: true }).click();
	const gallery = page.getByRole('region', { name: 'SDK UI gallery', exact: true });
	await expect(gallery.getByText('Gallery badge')).toBeVisible();
	await expect(gallery.getByText('Gallery empty state')).toBeVisible();
	await gallery.getByRole('textbox', { name: 'Gallery input' }).fill('typed');
	await gallery.getByRole('switch', { name: 'Gallery switch' }).click();
	await gallery.getByRole('combobox', { name: 'Gallery choice' }).click();
	await page.getByRole('option', { name: 'Beta' }).click();
	await gallery.getByRole('tab', { name: 'Gallery second' }).click();
	await expect(gallery.getByText('Gallery list item')).toBeVisible();
	await expect(gallery.getByTestId('sdk-ui-state')).toHaveText('typed b true b');

	await gallery.getByRole('slider', { name: 'Gallery slider' }).press('ArrowRight');
	await expect(gallery.getByRole('progressbar', { name: 'Gallery progress' })).toHaveAttribute('value', '30');
	await expect(gallery.getByText('Gallery transfer')).toBeVisible();
	await gallery.getByRole('button', { name: 'Gallery card' }).click();
	await expect(gallery.getByTestId('sdk-ui-result')).toHaveText('card');
	await gallery.getByRole('button', { name: 'Gallery dropdown' }).click();
	await page.getByRole('menuitem', { name: 'Select gallery action' }).click();
	await expect(gallery.getByTestId('sdk-ui-result')).toHaveText('selected');
	await gallery.getByRole('button', { name: 'Gallery context menu' }).click({ button: 'right' });
	await page.getByRole('menuitem', { name: 'Select gallery action' }).click();
	await expect(gallery.getByTestId('sdk-ui-result')).toHaveText('context:selected');

	await gallery.getByRole('button', { name: 'Open gallery dialog' }).click();
	const dialog = page.getByRole('dialog', { name: 'Gallery dialog' });
	await expect(dialog.getByText('UI_THEME_UNAVAILABLE')).toBeVisible();
	await dialog.getByRole('button', { name: 'Close gallery dialog' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(gallery.getByTestId('sdk-ui-edges')).toHaveText('4');
	await gallery.getByRole('button', { name: 'Gallery resize' }).press('ArrowRight');
	await expect(gallery.getByTestId('sdk-ui-result')).toHaveText(/^resize:[1-9]\d*:0$/u);

	await gallery.getByRole('button', { name: 'Toggle gallery transition' }).click();
	await expect(gallery.getByText('Gallery transition content')).toBeVisible();
	await gallery.getByRole('button', { name: 'Toggle gallery transition' }).click();
	await expect(gallery.getByText('Gallery transition content')).toHaveCount(0);
	await gallery.getByRole('button', { name: 'Show gallery toast' }).click();
	const toast = page.getByRole('region', { name: 'Gallery notices' });
	await expect(toast.getByText('Gallery notification')).toBeVisible();
	await toast.getByRole('button', { name: 'Dismiss gallery toast' }).click();
	await expect(toast.getByText('Gallery notification')).toHaveCount(0);
	await gallery.getByRole('button', { name: 'Close application' }).click();
	await expect(gallery).toHaveCount(0);
}

test('发布镜像安装独立插件并执行 SDK 契约', { timeout: 120000 }, async (t) => {
	const resources = new AsyncDisposableStack();

	t.after(() => resources.disposeAsync());

	const host = await startHost(resources);
	const { json, request } = host;
	const browser = await chromium.launch();
	resources.defer(() => browser.close());
	const page = await browser.newPage({ locale: 'en-US', reducedMotion: 'reduce' });
	page.setDefaultTimeout(6000);
	const pageErrors: Error[] = [];
	page.on('pageerror', (error) => pageErrors.push(error));

	await t.test('Node SDK 验证迁移、服务、加密错误、HTTP 和二进制流', async () => {
		assert.deepEqual(Items.parse(await json(pluginPath + '/items')).items, [{ id: 'sample', revision: 2 }]);
		assert.deepEqual(await json(pluginPath + '/dependency'), { value: 'node-provider' });
		const logs = (await host.logs())
			.split('\n')
			.filter((line) => line.startsWith('{'))
			.map((line) => JSON.parse(line));
		assert.ok(
			logs.some(
				(event) =>
					event.code === 'TEST_PLUGIN_READY' &&
					event.source === manifest.name &&
					event.pluginId === manifest.name,
			),
		);
		assert.ok(logs.every((event) => event.code !== 'SDK_FORGED_LOG'));
		assert.deepEqual(await json(pluginPath + '/crypto'), {
			local: true,
			password: true,
			options: 'INVALID_OPTIONS',
			envelope: 'INVALID_ENVELOPE',
			authentication: 'AUTHENTICATION_FAILED',
		});
		const failure = HttpProblemSchema.parse(await json(pluginPath + '/conflict', undefined, 'GET', 409));
		assert.equal(failure.code, 'SDK_TEST_CONFLICT');
		assert.equal((await request(pluginPath + '/items?limit=not-a-number')).status, 400);

		const bytes = Uint8Array.of(0, 42, 255);
		const reply = await request(pluginPath + '/binary', {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body: bytes,
		});
		assert.equal(reply.status, 200);
		assert.equal(reply.headers.get('content-type'), 'application/octet-stream');
		assert.deepEqual(new Uint8Array(await reply.arrayBuffer()), bytes);
		const head = await request(pluginPath + '/binary', { method: 'HEAD' });
		assert.equal(head.status, 200);
		assert.equal(head.headers.get('content-length'), '3');
		assert.equal((await head.arrayBuffer()).byteLength, 0);

		const guest = new WebSocket(host.origin.replace('http:', 'ws:') + pluginPath + '/echo', {
			handshakeTimeout: 3000,
		});
		try {
			const [, rejected] = await once(guest, 'unexpected-response', { signal: AbortSignal.timeout(4000) });
			rejected.resume();
			assert.equal(rejected.statusCode, 401);
		} finally {
			guest.once('error', () => {});
			guest.terminate();
		}
	});

	const method = z.object({ baseURL: z.string() }).parse(await json(providerPath + '/method'));
	await t.test('登录扩展设置回调 cookie、拒绝错误凭证并交付会话', async () => {
		const callback = await fetch(host.origin + method.baseURL + 'begin', { redirect: 'manual' });
		assert.equal(callback.status, 303);
		assert.equal(callback.headers.get('location'), '/?fixture-callback=1');
		assert.match(callback.headers.get('set-cookie') ?? '', /nexus-fixture=started.*HttpOnly/u);
		await callback.body?.cancel();

		const denied = await fetch(host.origin + method.baseURL + 'finish', {
			method: 'POST',
			headers: { cookie: 'nexus-fixture=started', 'content-type': 'application/json' },
			body: JSON.stringify({ token: 'incorrect' }),
		});
		assert.equal(denied.status, 401);
		assert.equal(HttpProblemSchema.parse(await denied.json()).code, 'FIXTURE_TOKEN_INVALID');

		await page.addInitScript(
			(token) => sessionStorage.setItem('nexus-sdk-fixture-token', token),
			host.fixtureToken,
		);
		await page.goto(host.origin + method.baseURL + 'begin');
		await page.getByRole('button', { name: 'Fixture login', exact: true }).click();
		await expect(page.getByRole('button', { name: 'SDK probes', exact: true })).toBeVisible();
		await expect(page.getByText('Widget browser-provider')).toBeVisible();
	});

	const launcher = page.getByRole('button', { name: 'SDK probes', exact: true });
	const panel = page.getByRole('region', { name: 'SDK probes', exact: true });
	await t.test('Browser SDK 验证依赖、状态增量、HTTP、任务、WS 和窗口控制', async () => {
		await launcher.click();
		await expect(panel.getByText(/Plugin @nexus-terminal\/test running ready/u)).toBeVisible();
		await expect(panel.getByText('Revision 2 current')).toBeVisible();
		await json(pluginPath + '/revision', { revision: 3 }, 'PATCH');
		await expect(panel.getByText('Revision 3 current')).toBeVisible();
		await panel.getByRole('button', { name: 'Probe HTTP and tasks' }).click();
		await expect(panel.getByTestId('sdk-result')).toHaveText('node-provider SDK_TEST_CONFLICT true');
		for (const event of [
			'started:run',
			'settled:run:succeeded',
			'started:background',
			'settled:background:succeeded',
			'settled:run:cancelled',
		])
			await expect(panel.getByTestId('sdk-task-events')).toContainText(event);

		await panel.getByRole('tab', { name: 'SDK second tab' }).click();
		await expect(panel.getByText('Current tab two')).toBeVisible();
		await panel.getByRole('tab', { name: 'SDK second tab' }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Inspect SDK tab' }).click();
		await expect(panel.getByTestId('sdk-result')).toHaveText('two:inspect');
		await panel.getByRole('button', { name: 'Close tab SDK second tab' }).click();
		await expect(panel.getByRole('tab', { name: 'SDK second tab' })).toHaveCount(0);
		await panel.getByRole('button', { name: 'Add SDK tab' }).click();
		await expect(panel.getByText('Current tab added')).toBeVisible();
		await panel.getByRole('button', { name: 'SDK action' }).click();
		await expect(panel.getByTestId('sdk-result')).toHaveText('action');
		await panel.getByRole('button', { name: 'Clear SDK window controls' }).click();
		await expect(panel.getByRole('tab', { name: 'SDK first tab' })).toHaveCount(0);
		await expect(panel.getByRole('button', { name: 'SDK action', exact: true })).toHaveCount(0);
		await panel.getByRole('button', { name: 'Maximize SDK window' }).click();
		await expect(panel.getByText('Window maximized focused')).toBeVisible();
		await panel.getByRole('button', { name: 'Restore SDK window' }).click();
		await panel.getByRole('button', { name: 'Focus SDK window' }).click();
		await expect(panel.getByText('Window normal focused')).toBeVisible();
		await panel.getByRole('button', { name: 'Minimize SDK window' }).click();
		await expect(panel).toBeHidden();
		await launcher.click();
		await expect(panel).toBeVisible();

		await panel.getByRole('button', { name: 'Open SDK socket' }).click();
		await expect(panel.getByTestId('sdk-ws-events')).toHaveText('sdk-ready sdk-text 0,42,255');
		await expect(panel.getByTestId('sdk-ws-status')).toHaveText('OPEN');
		await expect(panel.getByTestId('sdk-ws-data')).toHaveText('binary data');
		await panel.getByRole('button', { name: 'Send oversized frame' }).click();
		await expect(panel.getByTestId('sdk-ws-disconnected')).toHaveText('1009');
		await panel.getByRole('button', { name: 'Open SDK socket' }).click();
		await expect(panel.getByTestId('sdk-ws-status')).toHaveText('OPEN');
		await panel.getByRole('button', { name: 'Close SDK socket' }).click();
		await expect(panel.getByTestId('sdk-ws-status')).toHaveText('CLOSED');
		await panel.getByRole('button', { name: 'Probe socket error' }).click();
		await expect(panel.getByTestId('sdk-ws-disconnected')).toHaveText('error');
		await panel.getByRole('button', { name: 'Request SDK close' }).click();
		await expect(panel.getByTestId('sdk-result')).toHaveText('close prevented');

		const opened = page.waitForEvent('websocket', {
			predicate: (event) => event.url().includes('/echo?'),

			timeout: 6000,
		});
		await panel.getByRole('button', { name: 'Open SDK socket' }).click();
		const socket = await opened;
		const closed = socket.waitForEvent('close', { timeout: 6000 });
		await panel.getByRole('button', { name: 'Allow SDK close' }).click();
		await panel.getByRole('button', { name: 'Request SDK close' }).click();
		await closed;
		await expect(panel).toHaveCount(0);
		await expect(page.locator('html')).toHaveAttribute('data-sdk-view', 'disposed');

		await page.getByRole('button', { name: 'Logs', exact: true }).click();
		const logs = page.getByRole('region', { name: 'Logs', exact: true });
		await expect(logs.getByText('SDK_BROWSER_PROBE').filter({ visible: true })).toBeVisible();
		await logs.getByRole('button', { name: 'Close application' }).click();
	});

	await t.test('UI SDK 组件、行为指令、主题和样式在真实宿主渲染', async () => {
		await exerciseGallery(page);
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		const settings = page.getByRole('region', { name: 'Settings', exact: true });
		await settings.getByRole('combobox', { name: 'Theme source' }).click();
		await page.getByRole('option', { name: 'SDK fixture theme' }).click();
		await expect(page.locator('html')).toHaveCSS('--ui-primary', '#123456');
		await settings.getByRole('button', { name: 'Close application' }).click();
	});

	await t.test('备份声明恢复迁移表和密文，重启实例后继续使用', async () => {
		await json(pluginPath + '/revision', { revision: 8 }, 'PATCH');
		const password = 'fixture-backup-password';
		const file = z
			.object({ format: z.literal(1), payload: z.string().min(1) })
			.parse(await json(backupPath + '/export', { password }));
		await json(pluginPath + '/revision', { revision: 9 }, 'PATCH');
		const preview = z
			.object({
				token: z.uuid(),
				tables: z.array(z.object({ pluginId: z.string(), table: z.string(), rows: z.number() })),
			})
			.parse(await json(backupPath + '/preview', { password, file }));
		assert.ok(
			preview.tables.some(
				({ pluginId, table, rows }) => pluginId === manifest.name && table === 'items' && rows === 1,
			),
		);
		assert.equal(Items.parse(await json(pluginPath + '/items')).items[0]?.revision, 9);
		const { id } = z
			.object({ id: z.uuid() })
			.parse(await json(backupPath + '/restore', { password, file, token: preview.token }, 'POST', 202));
		const finished = await until(async () => {
			const current = z
				.object({ job: z.object({ id: z.uuid(), state: z.string() }).passthrough().nullable() })
				.parse(await json(backupPath + '/status')).job;
			if (current?.id === id && current.state !== 'restoring') return current;
		});
		assert.equal(finished.state, 'succeeded', JSON.stringify(finished));
		assert.equal(Items.parse(await json(pluginPath + '/items')).items[0]?.revision, 8);
	});

	await t.test('撤销认证、停用和卸载释放插件能力，重新启用恢复数据', async () => {
		await json(providerPath + '/method', undefined, 'DELETE');
		const auth = z.object({ methods: z.array(z.object({ id: z.string() })) }).parse(await json('/api/auth/state'));
		assert.ok(auth.methods.every(({ id }) => id !== 'fixture'));
		const revoked = await fetch(host.origin + method.baseURL + 'begin');
		assert.equal(revoked.status, 404);
		await revoked.body?.cancel();

		await launcher.click();
		await expect(panel.getByText('Revision 8 current')).toBeVisible();
		await expect(panel.getByText('Provider state node-provider')).toBeVisible();
		await json(pluginPath + '/release-dependency', {});
		await expect(panel.getByText('Provider state unavailable')).toBeVisible();
		await until(async () => {
			const result = z.object({ released: z.boolean() }).parse(await json(pluginPath + '/dependency-cleanup'));
			return result.released || undefined;
		});
		const dependency = await request(pluginPath + '/dependency');
		assert.equal(dependency.status, 404);
		await dependency.body?.cancel();
		await panel.getByRole('button', { name: 'Open SDK socket' }).click();
		await expect(panel.getByTestId('sdk-ws-status')).toHaveText('OPEN');
		await setEnabled(host, manifest.name, false);
		await expect(launcher).toHaveCount(0);
		await expect(panel).toHaveCount(0);
		await expect(page.locator('html')).toHaveAttribute('data-sdk-phase', 'disposed');
		await expect(page.locator('html')).toHaveAttribute('data-sdk-deactivate', 'called');
		await expect(page.locator('html')).toHaveAttribute('data-sdk-dependency', 'disposed');
		await expect(page.locator('html')).not.toHaveCSS('--ui-primary', '#123456');
		const stopped = await request(pluginPath + '/items');
		assert.equal(stopped.status, 404);
		await stopped.body?.cancel();

		await setEnabled(host, manifest.name, true);
		await expect(launcher).toBeVisible();
		await expect(page.locator('html')).toHaveCSS('--ui-primary', '#123456');
		assert.equal(Items.parse(await json(pluginPath + '/items')).items[0]?.revision, 8);
		await uninstall(host, manifest.name);
		await expect(launcher).toHaveCount(0);
		await uninstall(host, provider.name);
		assert.deepEqual(await json(manager + '/plugins'), { items: [] });
	});

	assert.deepEqual(pageErrors, []);
});
