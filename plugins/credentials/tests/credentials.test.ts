import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { pluginFixture, startHost } from '../../test/tests/host.js';
import { CredentialSchema, CredentialsSnapshotSchema } from '../src/shared/credentials-types.js';

const pluginId = '@nexus-terminal/credentials';
const path = '/api/plugins/' + encodeURIComponent(pluginId) + '/credentials';

test(
	'packaged Credentials validates keys, preserves secrets on edits, and exposes summaries only',
	{ timeout: 45000 },
	async () => {
		await using resources = new AsyncDisposableStack();
		const host = await startHost(resources, pluginId, [
			pluginFixture(new URL('../../ssh/', import.meta.url), '@nexus-terminal/ssh'),
			pluginFixture(new URL('../', import.meta.url), pluginId),
		]);
		const secret = 'test-password-never-returned';
		const password = CredentialSchema.parse(
			await host.json(
				path,
				{
					credential: { name: 'Password fixture', username: 'owner', type: 'password', password: secret },
				},
				'POST',
				201,
			),
		);
		const renamed = CredentialSchema.parse(
			await host.json(
				path + '/' + password.id,
				{
					patch: { name: 'Renamed fixture' },
				},
				'PATCH',
			),
		);
		assert.equal(renamed.name, 'Renamed fixture');

		const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
		const privateKey = pair.privateKey.export({
			type: 'pkcs8',
			format: 'pem',
			cipher: 'aes-256-cbc',
			passphrase: 'fixture',
		});
		const invalid = await host.json(
			path,
			{
				credential: {
					name: 'Invalid key',
					username: 'owner',
					type: 'privateKey',
					privateKey,
					passphrase: 'wrong',
				},
			},
			'POST',
			400,
		);
		assert.equal((invalid as { code: string }).code, 'CREDENTIALS_KEY_INVALID');
		const key = CredentialSchema.parse(
			await host.json(
				path,
				{
					credential: {
						name: 'SSH key fixture',
						username: 'owner',
						type: 'privateKey',
						privateKey,
						passphrase: 'fixture',
					},
				},
				'POST',
				201,
			),
		);
		assert.equal(key.hasPassphrase, true);
		const result = CredentialsSnapshotSchema.parse(await host.json(path));
		assert.equal(result.items.length, 2);
		assert.doesNotMatch(JSON.stringify(result), /test-password-never-returned|BEGIN ENCRYPTED PRIVATE KEY/u);
		assert.equal((await host.request(path + '/' + key.id + '/material')).status, 404);

		const browser = await chromium.launch();
		resources.defer(() => browser.close());
		const page = await browser.newPage({ locale: 'en-US' });
		await page.goto(host.origin);
		await page.getByRole('textbox', { name: 'Username' }).fill('owner');
		await page.locator('input[type=password]').fill('sdk-fixture-password');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByRole('button', { name: 'Credentials', exact: true }).click();
		const app = page.getByRole('region', { name: 'Credentials', exact: true });
		await expect(app.getByText('Renamed fixture')).toBeVisible();
		await expect(app.getByText('SSH key fixture')).toBeVisible();

		await app.getByRole('button', { name: 'Add credential', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Add credential' });
		await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser credential');
		await dialog.getByRole('textbox', { name: 'Username', exact: true }).fill('browser-user');
		await dialog.locator('input[type=password]').fill('browser-fixture-password');
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(app.getByText('Browser credential')).toBeVisible();
		await expect(page.locator('[data-ui="toast"]').getByText('Credential saved.')).toBeVisible();

		await app.getByRole('button', { name: 'Add credential', exact: true }).click();
		await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Invalid browser key');
		await dialog.getByRole('textbox', { name: 'Username', exact: true }).fill('browser-user');
		await dialog.getByRole('combobox', { name: 'Authentication' }).click();
		await page.getByRole('option', { name: 'Private key', exact: true }).click();
		await dialog.getByRole('textbox', { name: 'Private key', exact: true }).fill('invalid key');
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.locator('[data-ui="toast"]').getByText('Invalid private key or passphrase.')).toBeVisible();
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

		const response = await host.request(path + '/' + key.id, { method: 'DELETE' });
		assert.equal(response.status, 204);
		await expect(app.getByText('SSH key fixture')).toHaveCount(0);
	},
);
