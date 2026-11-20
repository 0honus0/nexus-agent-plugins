import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { backupPath, pluginFixture, setEnabled, startHost, until } from '../../test/tests/host.js';
import { z } from 'zod';
import { CredentialSchema } from '../../credentials/src/shared/credentials-types.js';
import { ConnectionCatalogSchema, ConnectionSchema } from '../src/shared/connection-types.js';

const pluginId = '@nexus-terminal/connections';
const credentials = '/api/plugins/' + encodeURIComponent('@nexus-terminal/credentials') + '/credentials';
const base = '/api/plugins/' + encodeURIComponent(pluginId);
const connections = base + '/connections';

test(
	'packaged Connections handles profile types, normalized tags and cross-plugin credential references',
	{ timeout: 45000 },
	async () => {
		await using resources = new AsyncDisposableStack();
		const host = await startHost(resources, pluginId, [
			pluginFixture(new URL('../../ssh/', import.meta.url), '@nexus-terminal/ssh'),
			pluginFixture(new URL('../../credentials/', import.meta.url), '@nexus-terminal/credentials'),
			pluginFixture(new URL('../', import.meta.url), pluginId),
		]);

		async function credential(name: string) {
			return CredentialSchema.parse(
				await host.json(
					credentials,
					{
						credential: { name, username: 'user', type: 'password', password: 'fixture-password' },
					},
					'POST',
					201,
				),
			).id;
		}

		const linked = await credential('Linked');
		const spare = await credential('Spare');
		const input = {
			name: 'SSH fixture',
			host: 'example.test',
			type: 'ssh',
			port: 22,
			credentialId: linked,
			tags: ['QA', 'ｑａ'],
		};
		const ssh = ConnectionSchema.parse(await host.json(connections, { connection: input }, 'POST', 201));
		assert.equal(ssh.tags.length, 1);
		for (const [type, port] of [
			['rdp', 3389],
			['vnc', 5900],
		] as const)
			await host.json(
				connections,
				{ connection: { name: type.toUpperCase() + ' fixture', type, port, host: 'example.test' } },
				'POST',
				201,
			);
		const catalog = ConnectionCatalogSchema.parse(await host.json(base + '/catalog'));
		assert.equal(catalog.connections.length, 3);
		assert.equal(catalog.tags[0].count, 1);
		const blocked = await host.json(credentials + '/' + linked, undefined, 'DELETE', 409);
		assert.equal((blocked as { code: string }).code, 'CREDENTIALS_IN_USE');

		// A failed connection write releases the new reservation and retains the original association.
		await host.json(
			connections + '/' + randomUUID(),
			{ connection: { ...input, credentialId: spare } },
			'PUT',
			404,
		);
		assert.equal((await host.request(credentials + '/' + spare, { method: 'DELETE' })).status, 204);

		const password = 'fixture-backup-password';
		const file = z
			.object({ format: z.literal(1), payload: z.string().min(1) })
			.parse(await host.json(backupPath + '/export', { password }));

		const browser = await chromium.launch();
		resources.defer(() => browser.close());
		const page = await browser.newPage({ locale: 'en-US' });
		page.setDefaultTimeout(8000);
		await page.goto(host.origin);
		await page.getByRole('textbox', { name: 'Username' }).fill('owner');
		await page.locator('input[type=password]').fill('sdk-fixture-password');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		const tile = page.locator('[data-tile="@nexus-terminal/connections:applications:main"]');
		await expect(tile.locator('.connections-tile__total strong')).toHaveText('3');
		await expect(tile.locator('[data-type="ssh"] strong')).toHaveText('1');

		await page.locator('.dock-reveal').evaluate((button: HTMLElement) => button.click());
		await page.getByRole('button', { name: 'Edit desktop' }).click();
		await tile.locator('.desktop-tile__size').click();
		const size = page.getByRole('dialog', { name: 'Tile size' });
		await size.getByRole('button', { name: '1 × 1', exact: true }).click();
		await size.getByRole('button', { name: 'Close application' }).click();
		await page.locator('.dock-reveal').evaluate((button: HTMLElement) => button.click());
		await page.getByRole('button', { name: 'Finish editing' }).click();

		await expect(tile.locator('.connections-tile')).toHaveAttribute('data-shape', 'compact');
		await expect(tile.locator('.connections-tile__groups')).toHaveCount(0);
		await expect(tile.locator('.connections-tile__total strong')).toHaveText('3');
		await tile.getByRole('button', { name: 'Connections', exact: true }).click();
		const app = page.getByRole('region', { name: 'Connections', exact: true }).first();
		await expect(app.getByText('SSH fixture')).toBeVisible();
		await expect(app.getByText('RDP fixture')).toBeVisible();
		await expect(app.getByText('VNC fixture')).toBeVisible();

		await app.getByRole('button', { name: 'Add connection', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Add connection' });
		await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser connection');
		await dialog.getByRole('textbox', { name: 'Host', exact: true }).fill('browser.example.test');
		await dialog.getByRole('button', { name: 'Add credential', exact: true }).click();
		const manager = page.getByRole('region', { name: 'Credentials', exact: true });
		await expect(manager).toBeVisible();
		await expect(dialog).toHaveCount(0);
		await manager.getByRole('button', { name: 'Close application' }).click();
		await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Browser connection');
		await expect(dialog.getByRole('textbox', { name: 'Host', exact: true })).toHaveValue('browser.example.test');
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(app.getByText('Browser connection')).toBeVisible();
		await expect(page.locator('[data-ui="toast"]').getByText('Connection saved.')).toBeVisible();
		await expect(tile.locator('.connections-tile__total strong')).toHaveText('4');

		assert.equal((await host.request(base + '/tags/' + catalog.tags[0].id, { method: 'DELETE' })).status, 204);
		assert.deepEqual(ConnectionSchema.parse(await host.json(connections + '/' + ssh.id)).tags, []);
		assert.equal((await host.request(connections + '/' + ssh.id, { method: 'DELETE' })).status, 204);
		assert.equal((await host.request(credentials + '/' + linked, { method: 'DELETE' })).status, 204);
		await expect(app.getByText('SSH fixture')).toHaveCount(0);

		await app.getByRole('button', { name: 'Close application' }).click();
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		await page.getByRole('combobox', { name: 'Language' }).click();
		await page.getByRole('option', { name: '简体中文' }).click();
		await page.getByRole('region', { name: '设置', exact: true }).getByRole('button', { name: '关闭应用' }).click();
		await tile.getByRole('button', { name: '连接管理', exact: true }).click();
		const localizedApp = page.getByRole('region', { name: '连接管理', exact: true }).first();
		await localizedApp.getByRole('button', { name: '添加连接', exact: true }).click();
		await page.getByRole('dialog', { name: '添加连接' }).getByRole('button', { name: '关闭', exact: true }).click();
		await localizedApp.getByRole('button', { name: '关闭应用' }).click();
		await expect(localizedApp).toHaveCount(0);
		await expect(tile.getByRole('button', { name: '连接管理', exact: true })).toBeVisible();

		const preview = z
			.object({
				token: z.uuid(),
				tables: z.array(z.object({ pluginId: z.string(), table: z.string(), rows: z.number() })),
			})
			.parse(await host.json(backupPath + '/preview', { password, file }));
		assert.ok(preview.tables.some(({ table, rows }) => table === 'credential_references' && rows === 1));
		assert.ok(preview.tables.some(({ table, rows }) => table === 'connections' && rows === 3));
		const { id: restoreId } = z
			.object({ id: z.uuid() })
			.parse(await host.json(backupPath + '/restore', { password, file, token: preview.token }, 'POST', 202));
		const restore = await until(async () => {
			const { job } = z
				.object({ job: z.object({ id: z.string(), state: z.string() }).nullable() })
				.parse(await host.json(backupPath + '/status'));
			if (job?.id === restoreId && job.state !== 'restoring') return job;
		});
		assert.equal(restore.state, 'succeeded', JSON.stringify(restore));
		const restored = ConnectionSchema.parse(await host.json(connections + '/' + ssh.id));
		assert.equal(restored.credentialId, linked);
		assert.deepEqual(restored.tags, ssh.tags);
		const patched = CredentialSchema.parse(
			await host.json(
				credentials + '/' + linked,
				{
					patch: { name: 'Restored encrypted credential' },
				},
				'PATCH',
			),
		);
		assert.equal(patched.id, linked);
		await host.json(credentials + '/' + linked, undefined, 'DELETE', 409);
		await setEnabled(host, pluginId, false);
		await expect(tile.locator('.connections-tile')).toHaveCount(0);
	},
);
