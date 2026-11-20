import { chromium, expect } from '@playwright/test';
import { it } from 'vitest';
import { manager as marketplaceManager, pluginFixture, startHost } from '../../test/tests/host.js';
import { collectBrowserErrors, expectFormFields } from '../../test/tests/browser-checks.js';
import {
	OidcBindingAuthorizationSchema,
	OidcStatusSchema,
	oidcBindingCallbackPath,
} from '../src/shared/oidc-http-types.js';
import { startProvider } from './fixtures/oidc-provider.js';

const id = '@nexus-terminal/oidc';

const path = '/api/plugins/' + encodeURIComponent(id);

it('binds an account before configuration and accepts only a valid signature for the bound subject', async () => {
	await using resources = new AsyncDisposableStack();
	const provider = await startProvider(resources);
	const host = await startHost(resources, id, [pluginFixture(new URL('../', import.meta.url), id)], {
		certificateAuthority: provider.certificateAuthority,
	});
	const unauthorized = await fetch(host.origin + path + '/configuration');
	expect(unauthorized.status).toBe(401);
	await unauthorized.body?.cancel();
	for (const action of ['start', 'finish']) {
		const response = await fetch(host.origin + path + '/binding/' + action, { method: 'POST' });
		expect(response.status).toBe(401);
		await response.body?.cancel();
	}

	const browser = await chromium.launch({
		headless: true,
		args: ['--host-resolver-rules=MAP sdk-repository.test 127.0.0.1'],
	});
	resources.defer(() => browser.close());
	const page = await browser.newPage({ locale: 'en-US', ignoreHTTPSErrors: true });
	const errors = collectBrowserErrors(page);
	page.setDefaultTimeout(8000);
	await page.goto(host.origin);
	await expect(page.getByRole('button', { name: 'OpenID Connect', exact: true })).toHaveCount(0);
	await page.getByLabel('Username', { exact: true }).fill('owner');
	await page.getByLabel('Password', { exact: true }).fill('sdk-fixture-password');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();

	const app = page.getByRole('region', { name: 'OpenID Connect', exact: true });
	const initialConfig = Promise.withResolvers<void>();
	await page.route(
		host.origin + path + '/configuration',
		async (route) => {
			await initialConfig.promise;
			await route.continue();
		},
		{ times: 1 },
	);
	try {
		await page.getByRole('button', { name: 'OpenID Connect', exact: true }).click();
		await expect(app.getByLabel('Issuer URL', { exact: true })).toBeDisabled();
	} finally {
		initialConfig.resolve();
	}
	await expect(app.getByRole('heading', { name: 'Identity provider' })).toBeVisible();
	await expect(app.getByRole('heading', { name: 'Sign-in and redirect' })).toBeVisible();
	const clientFields = app.locator('.oidc-fields').first();

	const fieldsShareRow = () =>
		clientFields.evaluate((row) => {
			const [first, second] = [...row.children].map((field) => field.getBoundingClientRect());
			return first!.top === second!.top && first!.right <= second!.left;
		});

	await expect.poll(fieldsShareRow).toBe(true);
	const wideViewport = page.viewportSize()!;
	await page.setViewportSize({ width: 420, height: 800 });
	await expect.poll(fieldsShareRow).toBe(false);
	await expect(app.getByRole('button', { name: 'Authorize and bind', exact: true })).toBeVisible();
	await page.setViewportSize(wideViewport);

	await expect(app.getByRole('button', { name: 'Authorize and bind', exact: true })).toBeDisabled();
	await app.getByLabel('Issuer URL', { exact: true }).fill(provider.issuer);
	await app.getByLabel('Client ID', { exact: true }).fill(provider.clientId);
	await app.getByLabel('Client secret', { exact: true }).fill(provider.secret);
	await expect(app.getByLabel('Allowed subject (sub)', { exact: true })).toHaveValue('');
	const before = OidcStatusSchema.parse(await host.json(path + '/configuration'));
	expect(before.config).toBeNull();
	const callbackUrl = host.origin + before.callbackPath;
	const bindingUrl = host.origin + oidcBindingCallbackPath;
	await expect(app.getByLabel('Redirect URI', { exact: true })).toHaveValue(callbackUrl);
	await expect(app.getByLabel('Binding redirect URI', { exact: true })).toHaveValue(bindingUrl);
	await expectFormFields(app.locator('form'));

	const startUrl = host.origin + path + '/binding/start';
	const finishUrl = host.origin + path + '/binding/finish';
	const started = await page.request.post(startUrl, {
		data: {
			issuer: provider.issuer,
			clientId: provider.clientId,
			clientSecret: provider.secret,
			origin: host.origin,
			authMethod: 'client_secret_basic',
		},
	});
	const { transaction } = OidcBindingAuthorizationSchema.parse(await started.json());
	const wrongState = await page.request.post(finishUrl, { data: { transaction, query: '?state=wrong&code=unused' } });
	expect(wrongState.status()).toBe(400);
	expect(OidcStatusSchema.parse(await host.json(path + '/configuration')).config).toBeNull();

	const [completed] = await Promise.all([
		page.waitForResponse(finishUrl),
		app.getByRole('button', { name: 'Authorize and bind', exact: true }).click(),
	]);
	expect(completed.status()).toBe(200);
	const replayBinding = await page.request.post(finishUrl, { data: completed.request().postDataJSON() });
	expect(replayBinding.status()).toBe(400);
	await expect(page).toHaveURL(host.origin + '/');
	await page.getByRole('button', { name: 'OpenID Connect', exact: true }).click();
	await expect(app.getByText('Configured', { exact: true })).toBeVisible();
	await expect(app.getByLabel('Allowed subject (sub)', { exact: true })).toHaveValue(provider.ownerSubject);
	await expect(app.getByLabel('Client secret', { exact: true })).toHaveValue('');
	const saved = await host.json(path + '/configuration');
	expect(saved).not.toHaveProperty('config.clientSecret');
	expect(OidcStatusSchema.parse(saved).config?.subject).toBe(provider.ownerSubject);
	await host.operation(marketplaceManager + '/reload', { pluginId: id });

	expect((await page.request.post(host.origin + '/api/auth/logout', { data: {} })).ok()).toBe(true);
	await page.goto(host.origin);
	const login = page.getByRole('button', { name: 'OpenID Connect', exact: true });
	provider.setSubject('unbound-subject');
	const rejected = page.waitForResponse((response) => response.url().startsWith(callbackUrl + '?'));
	await login.click();
	expect((await rejected).headers().location).toBe('/login?oidc=failed');
	await expect(page.getByText('OpenID Connect sign-in could not be verified.', { exact: true })).toBeVisible();
	await expect(login).toBeVisible();

	provider.setSubject(provider.ownerSubject);
	provider.setValidSignature(false);
	const invalidSignature = page.waitForResponse((response) => response.url().startsWith(callbackUrl + '?'));
	await login.click();
	expect((await invalidSignature).headers().location).toBe('/login?oidc=failed');
	await expect(login).toBeVisible();

	provider.setValidSignature(true);
	const accepted = page.waitForResponse((response) => response.url().startsWith(callbackUrl + '?'));
	await login.click();
	const acceptedResponse = await accepted;
	const cookie = (await acceptedResponse.request().allHeaders()).cookie;
	expect(cookie?.includes('nexus.oidc='), 'OIDC browser transaction cookie is present').toBe(true);
	expect(provider.tokensIssued, 'each callback exchanged its authorization code').toBe(4);
	expect(acceptedResponse.headers().location).toBe('/');
	await expect(page).toHaveURL(host.origin + '/');
	await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

	const replay = await page.request.get(acceptedResponse.url(), { maxRedirects: 0 });
	expect(replay.headers().location).toBe('/login?oidc=failed');
	expect(provider.tokensIssued).toBe(4);
	expect(errors).toEqual([]);
}, 60_000);
