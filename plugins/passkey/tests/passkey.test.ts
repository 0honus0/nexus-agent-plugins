import { chromium, expect } from '@playwright/test';
import { it } from 'vitest';
import { manager as marketplaceManager, pluginFixture, startHost } from '../../test/tests/host.js';
import { PasskeyListSchema } from '../src/shared/passkey-http-types.js';

const id = '@nexus-terminal/passkey';

const path = '/api/plugins/' + encodeURIComponent(id);

it('enrolls, signs in with a discoverable passkey, and removes it', async () => {
	await using resources = new AsyncDisposableStack();
	const host = await startHost(resources, id, [pluginFixture(new URL('../', import.meta.url), id)]);
	const anonymous = await fetch(host.origin + path + '/passkeys');
	expect(anonymous.status).toBe(401);
	await anonymous.body?.cancel();

	const browser = await chromium.launch({ headless: true });
	resources.defer(() => browser.close());
	const page = await browser.newPage({ locale: 'en-US' });
	page.setDefaultTimeout(8000);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});

	const origin = new URL(host.origin);
	origin.hostname = 'localhost';
	await page.goto(origin.href);
	await expect(page.getByRole('button', { name: 'Passkey', exact: true })).toHaveCount(0);
	await page.getByLabel('Username', { exact: true }).fill('owner');
	await page.getByLabel('Password', { exact: true }).fill('sdk-fixture-password');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByRole('button', { name: 'Passkeys', exact: true }).click();
	const manager = page.getByRole('region', { name: 'Passkeys', exact: true });
	await expect(manager.getByText('No passkeys registered')).toBeVisible();
	await manager.getByLabel('Passkey name').fill('Fixture authenticator');
	await manager.getByRole('button', { name: 'Add passkey', exact: true }).click();
	await expect(manager.getByText('Fixture authenticator')).toBeVisible();

	const { items } = PasskeyListSchema.parse(await host.json(path + '/passkeys'));
	expect(items).toEqual([expect.objectContaining({ name: 'Fixture authenticator', origin: origin.origin })]);
	await host.operation(marketplaceManager + '/reload', { pluginId: id });

	expect((await page.request.post(origin.origin + '/api/auth/logout', { data: {} })).ok()).toBe(true);
	await page.goto(origin.href);
	const login = page.getByRole('button', { name: 'Passkey', exact: true });
	const verificationPromise = page.waitForResponse((response) => response.url().endsWith('/passkey/verify'));
	await login.click();
	const verification = await verificationPromise;
	expect(verification.status(), await verification.text()).toBe(200);
	await expect(page).not.toHaveURL(/\/login/u);
	const replay = await page.request.post(verification.url(), { data: verification.request().postDataJSON() });
	expect(replay.status()).toBe(400);

	await page.getByRole('button', { name: 'Passkeys', exact: true }).click();
	await manager.getByRole('button', { name: 'Remove · Fixture authenticator', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Remove passkey?' })
		.getByRole('button', { name: 'Remove', exact: true })
		.click();
	await expect(manager.getByText('No passkeys registered')).toBeVisible();
	expect((await page.request.post(origin.origin + '/api/auth/logout', { data: {} })).ok()).toBe(true);
	await page.goto(origin.href);
	await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
	await expect(login).toHaveCount(0);
}, 60_000);
