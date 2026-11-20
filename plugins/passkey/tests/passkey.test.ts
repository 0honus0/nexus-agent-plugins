import { chromium, expect } from '@playwright/test';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { it } from 'vitest';
import { manager as marketplaceManager, pluginFixture, startHost } from '../../test/tests/host.js';
import { PasskeyListSchema, PasskeyRegistrationFinishSchema } from '../src/shared/passkey-http-types.js';

const id = '@nexus-terminal/passkey';

const path = '/api/plugins/' + encodeURIComponent(id);

it.each([
	{ aaguid: undefined, name: '', label: 'Passkey' },
	{ aaguid: 'd548826e-79b4-db40-a3d8-11116f7e8349', name: 'Bitwarden Passkey', label: 'Bitwarden Passkey' },
])(
	'enrolls, signs in with, and removes $label',
	async ({ aaguid, name, label }) => {
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
		const emptyState = manager.locator('[data-ui="empty-state"]');
		const list = manager.getByRole('list');
		const addButton = { name: 'Add passkey', exact: true };
		await expect(manager.getByText('No passkeys registered')).toBeVisible();
		await expect(manager.getByRole('textbox')).toHaveCount(0);
		if (aaguid) {
			await page.route(
				'**/passkeys/verify',
				async (route) => {
					const data = PasskeyRegistrationFinishSchema.parse(route.request().postDataJSON());
					const response = data.credential.response;
					const attestation = isoCBOR.decodeFirst<Map<string, Parameters<typeof isoCBOR.encode>[0]>>(
						Buffer.from(response.attestationObject, 'base64url'),
					);
					const authData = attestation.get('authData');
					if (!(authData instanceof Uint8Array)) throw new Error('Missing authenticator data');
					// Chromium's virtual authenticator is anonymous. Populate the AAGUID in its none attestation.
					authData.set(Buffer.from(aaguid.replaceAll('-', ''), 'hex'), 37);
					response.attestationObject = Buffer.from(isoCBOR.encode(attestation)).toString('base64url');
					await route.continue({ postData: data });
				},
				{ times: 1 },
			);
		}
		await expect(list).toHaveCount(0);
		await emptyState.getByRole('button', addButton).click();
		await expect(manager.getByText(label, { exact: true })).toBeVisible();
		const addAnother = list.getByRole('listitem').last().getByRole('button', addButton);
		await expect(addAnother).toBeEnabled();
		await expect(addAnother).toHaveAttribute('data-appearance', 'ghost');
		await expect(emptyState).toHaveCount(0);

		const { items } = PasskeyListSchema.parse(await host.json(path + '/passkeys'));
		expect(items).toEqual([expect.objectContaining({ name, origin: origin.origin })]);
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
		await manager.getByRole('button', { name: 'Remove · ' + label, exact: true }).click();
		await page
			.getByRole('dialog', { name: 'Remove passkey?' })
			.getByRole('button', { name: 'Remove', exact: true })
			.click();
		await expect(manager.getByText('No passkeys registered')).toBeVisible();
		await expect(emptyState.getByRole('button', addButton)).toBeEnabled();
		expect((await page.request.post(origin.origin + '/api/auth/logout', { data: {} })).ok()).toBe(true);
		await page.goto(origin.href);
		await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
		await expect(login).toHaveCount(0);
	},
	60_000,
);
