import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { chromium, expect as browserExpect } from '@playwright/test';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { pluginFixture, setEnabled, startHost, until } from '../../test/tests/host.js';
import { collectBrowserErrors, expectFormFields } from '../../test/tests/browser-checks.js';
import { startWorkspaceSsh } from './fixtures/workspace-ssh.js';
import {
	verifyTerminalSelection,
	verifyWorkspaceAppearance,
	verifyWorkspacePanels,
	verifyWorkspaceTransfers,
} from './browser/workspace-browser-checks.js';
import { BackgroundSnapshotSchema } from '../src/shared/workspace-background-types.js';
import { WorkspaceLayoutResponseSchema, WorkspaceLayoutSchema } from '../src/shared/workspace-layout-types.js';
import { SessionCreateResultSchema, SessionListResponseSchema } from '../src/shared/workspace-types.js';

const id = '@nexus-terminal/workspace';
const base = '/api/plugins/' + encodeURIComponent(id);

const resource = (name: string) => '/api/plugins/' + encodeURIComponent('@nexus-terminal/' + name);

it('installs and opens Workspace, confirms a host key and streams terminal and file data', async () => {
	await using resources = new AsyncDisposableStack();
	const host = await startHost(resources, id, [
		...['ssh', 'credentials', 'connections', 'remote-tools'].map((name) =>
			pluginFixture(new URL('../../' + name + '/', import.meta.url), '@nexus-terminal/' + name),
		),
		pluginFixture(new URL('../', import.meta.url), id),
	]);
	const directory = await mkdtemp(join(tmpdir(), 'nexus-workspace-ssh-'));
	resources.defer(() => rm(directory, { recursive: true, force: true }));
	const content = Buffer.from('example file');
	await writeFile(join(directory, 'file.txt'), content);
	await writeFile(join(directory, 'blocked.txt'), content);
	await mkdir(join(directory, 'prefetch-fixture'));
	await writeFile(join(directory, 'prefetch-fixture', 'prefetched.txt'), content);
	const readStarted = Promise.withResolvers<void>();
	const releaseRead = Promise.withResolvers<void>();
	const { fingerprint, channels, peers, port } = await startWorkspaceSsh(resources, directory, async (path) => {
		if (path !== '/blocked.txt') return;
		readStarted.resolve();
		await releaseRead.promise;
	});
	const destination = await mkdtemp(join(tmpdir(), 'nexus-workspace-destination-'));
	resources.defer(() => rm(destination, { recursive: true, force: true }));
	const target = await startWorkspaceSsh(resources, destination);
	resources.defer(releaseRead.resolve);

	const credential = z.object({ id: z.uuid() }).parse(
		await host.json(
			resource('credentials') + '/credentials',
			{
				credential: { name: 'Fixture', username: 'fixture', password: 'fixture-only', type: 'password' },
			},
			'POST',
			201,
		),
	);
	const connection = z.object({ id: z.uuid() }).parse(
		await host.json(
			resource('connections') + '/connections',
			{
				connection: {
					name: 'Workspace test SSH',
					host: 'sdk-repository.test',
					port: port,
					type: 'ssh',
					credentialId: credential.id,
					tags: [],
				},
			},
			'POST',
			201,
		),
	);
	await host.json(
		resource('connections') + '/connections',
		{
			connection: {
				name: 'Closed SSH port',
				host: '127.0.0.1',
				port: 1,
				type: 'ssh',
				credentialId: credential.id,
				tags: [],
			},
		},
		'POST',
		201,
	);

	expect(await host.json(base + '/layouts/compact')).toEqual({ layout: null });
	expect(await host.json(base + '/catalog')).toMatchObject({ favorites: [], commands: [], themes: [] });
	expect(await host.json(base + '/appearance')).toMatchObject({ image: null, presets: [] });
	const layout = WorkspaceLayoutSchema.parse({
		version: 4,
		locked: true,
		dock: {
			grid: { width: 640, height: 480, orientation: 'HORIZONTAL', root: { type: 'branch', data: [] } },
			panels: {},
		},
	});
	await host
		.request(base + '/layouts/medium', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(layout),
		})
		.then((response) => expect(response.status).toBe(204));
	expect(WorkspaceLayoutResponseSchema.parse(await host.json(base + '/layouts/medium')).layout).toEqual(layout);
	expect(await host.json(base + '/layouts/wide')).toEqual({ layout: null });
	expect(
		await host.json(
			base + '/catalog/favorites',
			{ version: 0, value: { name: 'Fixture path', path: '/prefetch-fixture' } },
			'POST',
			201,
		),
	).toMatchObject({ favorites: [{ name: 'Fixture path', path: '/prefetch-fixture' }] });

	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1xsAAAAASUVORK5CYII=',
		'base64',
	);
	const imageUpload = await host.request(base + '/appearance/image', {
		method: 'PUT',
		headers: { 'content-type': 'application/octet-stream', 'if-match': '0' },
		body: new Uint8Array(png),
	});
	expect(imageUpload.status).toBe(200);
	const appearance = BackgroundSnapshotSchema.parse(await imageUpload.json());
	expect(appearance.image?.mime).toBe('image/png');
	const imageDownload = await host.request(base + '/appearance/image/' + appearance.image!.id);
	expect(Buffer.from(await imageDownload.arrayBuffer())).toEqual(png);

	const initial = SessionCreateResultSchema.parse(
		await host.json(base + '/sessions', { connectionId: connection.id }),
	);
	expect(initial.result).toEqual({ state: 'confirm-host', fingerprint });

	const browser = await chromium.launch({ headless: true });
	resources.defer(() => browser.close());
	const page = await browser.newPage({
		viewport: { width: 1600, height: 1000 },
		locale: 'en-US',
		reducedMotion: 'reduce',
	});
	page.setDefaultTimeout(8000);
	const browserErrors = collectBrowserErrors(page);

	const homeAsset = Promise.withResolvers<void>();
	const sessionAsset = Promise.withResolvers<void>();
	const catalog = Promise.withResolvers<void>();
	const statusSample = Promise.withResolvers<void>();
	const workspaceCatalog = Promise.withResolvers<void>();
	const handshakeStarted = Promise.withResolvers<void>();
	const releaseHandshake = Promise.withResolvers<void>();
	await page.route('**' + base + '/sessions', async (route) => {
		if (route.request().method() === 'POST' && route.request().postDataJSON().connectionId === connection.id) {
			handshakeStarted.resolve();
			await releaseHandshake.promise;
		}
		await route.continue();
	});
	await page.routeWebSocket('**/status?*', (socket) => {
		const server = socket.connectToServer();
		server.onMessage(async (message) => {
			await statusSample.promise;
			socket.send(message);
		});
	});
	let catalogAvailable = false;
	let requestedSession = false;
	await page.route(/\/WorkspaceApp-[^/]+\.js$/u, async (route) => {
		await homeAsset.promise;
		await route.continue();
	});
	await page.route(/\/WorkspaceSessionTabs-[^/]+\.js$/u, async (route) => {
		requestedSession = true;
		await sessionAsset.promise;
		await route.continue();
	});
	await page.route('**/api/plugins/*/catalog', async (route) => {
		const endpoint = decodeURIComponent(new URL(route.request().url()).pathname);
		if (endpoint.includes('/@nexus-terminal/workspace/')) {
			await workspaceCatalog.promise;
			await route.continue();
			return;
		}
		if (!endpoint.includes('/@nexus-terminal/connections/')) {
			await route.continue();
			return;
		}
		await catalog.promise;
		if (catalogAvailable) await route.continue();
		else await route.fulfill({ status: 503, json: { code: 'CONNECTIONS_OPERATION_FAILED' } });
	});

	await page.goto(host.origin);
	await page.getByLabel('Username', { exact: true }).fill('owner');
	await page.getByLabel('Password', { exact: true }).fill('sdk-fixture-password');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	const tile = page.locator('[data-tile="@nexus-terminal/workspace:applications:main"]');
	await tile.getByRole('button', { name: 'Workspace', exact: true }).click();
	const workspace = page.getByRole('region', { name: 'Workspace', exact: true }).first();
	await browserExpect(workspace.getByText('Opening Workspace…')).toBeVisible();
	homeAsset.resolve();
	await browserExpect(workspace.getByText('Loading connections…')).toBeVisible();
	await browserExpect(workspace.getByText('Add a server and link a credential in Connections first.')).toHaveCount(0);
	expect(requestedSession).toBe(false);

	catalog.resolve();
	await browserExpect(workspace.getByText('Could not load connections.')).toBeVisible();
	catalogAvailable = true;
	await workspace.getByRole('button', { name: 'Retry', exact: true }).click();
	await browserExpect(workspace.getByText('Workspace test SSH', { exact: true })).toBeVisible();
	const groupHeading = workspace.locator('.workspace-group-heading');
	await browserExpect(groupHeading.locator('[data-ui="badge"]')).toHaveText('2');
	await browserExpect(groupHeading).toHaveAttribute('aria-expanded', 'true');

	const filters = workspace.locator('.workspace-home-filters');
	const inputBounds = await filters.locator('[data-ui="input"]').boundingBox();
	const selectBounds = await filters.locator('[data-ui="select"]').boundingBox();
	expect(inputBounds!.height).toBe(selectBounds!.height);

	const refused = page.waitForResponse(
		(response) => new URL(response.url()).pathname === base + '/sessions' && response.status() === 502,
	);
	await workspace.getByRole('button', { name: 'Closed SSH port', exact: true }).click();
	expect(await (await refused).json()).toMatchObject({ code: 'SSH_CONNECTION_REFUSED' });
	await browserExpect(
		page
			.locator('[data-ui="toast"]')
			.getByText('The TCP connection was refused. Check the port and whether SSH is listening.'),
	).toBeVisible();

	await workspace.getByRole('button', { name: 'Workspace test SSH', exact: true }).click();
	const confirmation = page.getByRole('dialog', { name: 'Verify server identity' });
	try {
		await handshakeStarted.promise;
		await browserExpect.poll(() => requestedSession).toBe(true);
		await browserExpect(confirmation).toHaveCount(0);
	} finally {
		releaseHandshake.resolve();
	}
	await browserExpect(confirmation.getByText(fingerprint, { exact: true })).toBeVisible();
	await confirmation.getByRole('button', { name: 'Trust and connect' }).click();
	await browserExpect(workspace.getByText('Opening Workspace…')).toBeVisible();
	sessionAsset.resolve();
	await browserExpect(workspace.locator('.xterm')).toBeVisible();
	await expectFormFields(workspace.locator('.workspace-terminal'));
	try {
		const loading = workspace.locator('.status-loading[role="status"]');
		await browserExpect(loading).toBeVisible();
		await browserExpect(loading.locator('.status-loading-spinner')).toBeVisible();
	} finally {
		statusSample.resolve();
	}
	await until(async () => {
		const { items } = SessionListResponseSchema.parse(await host.json(base + '/sessions'));
		return items.some((item) => item.state === 'attached') || undefined;
	});

	const favoriteEditor = page.getByRole('dialog', { name: 'Edit favorite', exact: true });
	try {
		await workspace.getByRole('button', { name: 'Favorite paths', exact: true }).click();
		const addFavorite = page.getByRole('menuitem', { name: 'Save current path', exact: true });
		await browserExpect(addFavorite).toBeEnabled();
		await addFavorite.click();
		await browserExpect(favoriteEditor).toBeVisible();
		await favoriteEditor
			.locator('label[for]')
			.filter({ hasText: /^Remote path$/u })
			.click();
		await browserExpect(favoriteEditor.getByRole('textbox', { name: 'Remote path', exact: true })).toBeFocused();
		await expectFormFields(favoriteEditor);
		await favoriteEditor.getByRole('button', { name: 'Save', exact: true }).click();
		await browserExpect(favoriteEditor.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	} finally {
		workspaceCatalog.resolve();
	}
	await browserExpect(favoriteEditor).toHaveCount(0);
	expect(await host.json(base + '/catalog')).toMatchObject({
		favorites: expect.arrayContaining([expect.objectContaining({ name: '/', path: '/' })]),
	});

	channels[0].write('audit selectable');
	await verifyTerminalSelection(workspace);
	await verifyWorkspacePanels(page, workspace, host);
	await verifyWorkspaceAppearance(page, workspace, host);

	const destinationConnection = z.object({ id: z.uuid() }).parse(
		await host.json(
			resource('connections') + '/connections',
			{
				connection: {
					name: 'Workspace transfer destination',
					host: 'sdk-repository.test',
					port: target.port,
					type: 'ssh',
					credentialId: credential.id,
					tags: [],
				},
			},
			'POST',
			201,
		),
	);
	const destinationSession = SessionCreateResultSchema.parse(
		await host.json(base + '/sessions', {
			connectionId: destinationConnection.id,
			hostKeyFingerprint: target.fingerprint,
		}),
	);
	if (destinationSession.result.state !== 'created') throw new Error('WORKSPACE_TEST_DESTINATION_NOT_CREATED');
	const source = SessionListResponseSchema.parse(await host.json(base + '/sessions')).items.find(
		(item) => item.state === 'attached',
	)!;
	await verifyWorkspaceTransfers(page, workspace, {
		sourceId: source.id,
		destinationId: destinationSession.result.session.id,
		directory: destination,
		readStarted: readStarted.promise,
		releaseRead: releaseRead.resolve,
	});

	const created = SessionCreateResultSchema.parse(
		await host.json(base + '/sessions', {
			connectionId: connection.id,
		}),
	);
	if (created.result.state !== 'created') throw new Error('WORKSPACE_TEST_SESSION_NOT_CREATED');
	const { id: sessionId } = created.result.session;

	const cookies = await page.context().cookies();
	const cookie = cookies.map(({ name, value }) => name + '=' + value).join('; ');
	const terminal = new WebSocket(host.origin.replace(/^http/u, 'ws') + base + '/terminal?sessionId=' + sessionId, {
		headers: { cookie },
		handshakeTimeout: 3000,
	});
	resources.defer(() => terminal.terminate());
	const snapshot = once(terminal, 'message', { signal: AbortSignal.timeout(5000) });
	await once(terminal, 'open', { signal: AbortSignal.timeout(5000) });
	const [frame, binary] = await snapshot;
	expect(binary).toBe(false);
	expect(JSON.parse(frame.toString())).toMatchObject({ type: 'snapshot', closed: false });
	const chunk = once(terminal, 'message', { signal: AbortSignal.timeout(5000) });
	channels.at(-1)!.write('fixture-output');
	const [output, isBinary] = await chunk;
	expect(isBinary).toBe(true);
	expect(output.toString()).toBe('fixture-output');

	const file = base + '/sessions/' + sessionId + '/file?path=%2Ffile.txt';
	const head = await host.request(file, { method: 'HEAD' });
	expect(head.status).toBe(200);
	expect(head.headers.get('content-length')).toBe(String(content.length));
	const range = await host.request(file, { headers: { range: 'bytes=0-6' } });
	expect(range.status).toBe(206);
	expect(await range.text()).toBe('example');

	const upload = await host.request(base + '/sessions/' + sessionId + '/file?path=%2Fupload.txt&size=6', {
		method: 'PUT',
		headers: { 'content-type': 'application/octet-stream' },
		body: 'upload',
	});
	expect(upload.status).toBe(204);
	expect(await readFile(join(directory, 'upload.txt'), 'utf8')).toBe('upload');

	const suspended = await host.json(base + '/sessions/' + sessionId + '/suspend', {});
	expect(suspended).toMatchObject({ state: 'suspended' });
	const resumed = new WebSocket(terminal.url, { headers: { cookie }, handshakeTimeout: 3000 });
	resources.defer(() => resumed.terminate());
	const [resumedSnapshot] = await once(resumed, 'message', { signal: AbortSignal.timeout(5000) });
	expect(JSON.parse(resumedSnapshot.toString())).toMatchObject({ type: 'snapshot' });

	resumed.terminate();
	await until(async () => {
		const { items } = SessionListResponseSchema.parse(await host.json(base + '/sessions'));
		return items.some((item) => item.id === sessionId && item.state === 'disconnected') || undefined;
	});
	await page.reload();
	await tile.getByRole('button', { name: 'Workspace', exact: true }).click();
	const appearanceReload = page.waitForResponse(
		(response) => new URL(response.url()).pathname === base + '/appearance',
	);
	await workspace.getByRole('button', { name: 'Workspace test SSH', exact: true }).click();
	await browserExpect(workspace.locator('.xterm')).toBeVisible();
	expect((await appearanceReload).status()).toBe(200);
	await browserExpect(workspace.locator('.workspace-file-list')).toHaveCSS(
		'transform',
		'matrix(1.1, 0, 0, 1.1, 0, 0)',
	);

	await setEnabled(host, '@nexus-terminal/connections', false);
	await browserExpect(workspace).toBeVisible();
	await browserExpect(workspace.locator('.xterm')).toHaveCount(0);
	await setEnabled(host, id, false);
	await until(async () => peers.size === 0 || undefined);
	await browserExpect(workspace).toHaveCount(0);
	expect(browserErrors).toEqual([]);
}, 90000);
