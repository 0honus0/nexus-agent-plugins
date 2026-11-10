import { agentChatSurface, agentHost } from '@nexus-test/e2e/support/agent-host/workbench';
import { readAgentPluginFrontendRpc, readAgentPluginRpcResponse } from '@nexus-shared/agent/plugins/frontend-rpc-codec';

import { readAgentWorkspaceRequest, readAgentWorkspaceResponse } from '@nexus-shared/agent/scope/workspace-http-codec';
import type { AgentWorkspaceRequest } from '@nexus-shared/agent/scope/workspace-http';

import {
	openAgentConversations,
	openAgentHub,
	prepareAgentRun,
	selectAgentApp,
	selectAgentModel,
	createTestAgentApp,
	enableTestAgentExecution,
	requestAgentWorkspace,
} from '@nexus-test/e2e/support/agent';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@nexus-test/e2e/support/fixtures';
import { loginAsInitialAdmin, setUiLanguage } from '@nexus-test/e2e/support/auth';

test.use({ e2eServices: ['plugins', 'provider'], actionTimeout: 10_000 });

test('Agent thread selection stays responsive while earlier history is pending', async ({ page, context }) => {
	await loginAsInitialAdmin(context.request);
	await setUiLanguage(context.request);
	const app = await createTestAgentApp(context.request);
	await enableTestAgentExecution(context.request);

	const create = async (title: string) => {
		const result = await requestAgentWorkspace(context.request, app, {
			method: 'agent.threads.create',
			params: { autoTitle: false, operationId: randomUUID(), title },
		});
		if (result.method !== 'agent.threads.create') throw new Error('Unexpected thread confirmation');
		return result.value;
	};

	const first = await create('E2E Conversation A');
	const second = await create('E2E Conversation B');
	let held = 0;

	let release = () => {};

	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let hold = false;
	const rpcPath = `**/api/v1/agent/plugins/installations/${app.id}/frontend/rpc`;
	await page.route(rpcPath, async (route) => {
		const rpc = readAgentPluginFrontendRpc(route.request().postDataJSON());
		const command = rpc.envelope.request;
		if (
			hold &&
			(command.method === 'agent.threads.history' || command.method === 'agent.runs.list') &&
			command.params.threadId === first.id
		) {
			held += 1;
			await gate;
		}
		await route.continue();
	});
	try {
		await page.goto('/connections');
		await openAgentHub(page);
		const hub = agentChatSurface(page, app.id);
		await openAgentConversations(page);
		const threads = hub.locator('#agent-thread-sidebar');
		const firstButton = threads.getByRole('button').filter({ has: page.getByText(first.title, { exact: true }) });
		const secondButton = threads.getByRole('button').filter({ has: page.getByText(second.title, { exact: true }) });
		await secondButton.click();
		await expect(
			hub.locator('.agent-conversation-pane > header').getByText(second.title, { exact: true }),
		).toBeVisible();
		await openAgentConversations(page);
		await expect(firstButton).toBeEnabled();
		hold = true;
		await openAgentConversations(page);
		await firstButton.click();
		await expect.poll(() => held).toBeGreaterThan(0);
		await expect(
			hub.locator('.agent-conversation-pane > header').getByText(first.title, { exact: true }),
		).toBeVisible();
		await openAgentConversations(page);
		await expect(secondButton).toBeEnabled();
		await secondButton.click();
		await expect(
			hub.locator('.agent-conversation-pane > header').getByText(second.title, { exact: true }),
		).toBeVisible();
		release();
		await expect(
			hub.locator('.agent-conversation-pane > header').getByText(second.title, { exact: true }),
		).toBeVisible();
	} finally {
		release();
		await page.unroute(rpcPath);
	}
});

test('Agent create-thread Retry retains the exact operation after an unknown outcome and requires inspection', async ({
	page,
	context,
}) => {
	await loginAsInitialAdmin(context.request);
	await setUiLanguage(context.request);
	const app = await createTestAgentApp(context.request);
	await enableTestAgentExecution(context.request);

	const list = async () => {
		const result = await requestAgentWorkspace(context.request, app, {
			method: 'agent.threads.list',
			params: { after: null, limit: 50 },
		});
		if (result.method !== 'agent.threads.list') throw new Error('Unexpected thread list');
		return result.value.items;
	};

	const before = await list();
	const attempts: AgentWorkspaceRequest[] = [];
	const rpcPath = `**/api/v1/agent/plugins/installations/${app.id}/frontend/rpc`;
	await page.route(rpcPath, async (route) => {
		const rpc = readAgentPluginFrontendRpc(route.request().postDataJSON());
		if (rpc.envelope.request.method !== 'agent.threads.create') {
			await route.continue();
			return;
		}
		const body = readAgentWorkspaceRequest({ appVersion: app.version, request: rpc.envelope.request });
		attempts.push(body);
		if (attempts.length === 1) {
			const committed = await route.fetch();
			expect(committed.status()).toBe(200);
			const receipt = readAgentPluginRpcResponse(await committed.json(), rpc.envelope);
			if (!receipt.ok) throw new Error('Expected the original create-thread operation to commit');
			readAgentWorkspaceResponse(
				{ appId: app.id, appVersion: app.version, result: receipt.result },
				app.id,
				body,
			);
			await route.abort('connectionreset');
		} else {
			await route.continue();
		}
	});
	await page.goto('/connections');
	await openAgentHub(page);
	const hub = agentChatSurface(page, app.id);
	await openAgentConversations(page);
	const threads = hub.locator('#agent-thread-sidebar');
	await threads.getByRole('button', { name: 'New', exact: true }).click();
	await expect.poll(() => attempts.length).toBe(1);
	const retry = threads.getByRole('button', { name: 'Retry after checking state', exact: true });
	await expect(retry).toBeDisabled();
	await threads.getByRole('button', { name: 'Inspect original intention', exact: true }).click();
	await expect(retry).toBeEnabled();
	expect(await list()).toHaveLength(before.length + 1);
	await retry.click();
	await expect.poll(() => attempts.length).toBe(2);
	expect(attempts[1]).toEqual(attempts[0]);
	expect(attempts[0].request.method).toBe('agent.threads.create');
	if (attempts[0].request.method !== 'agent.threads.create') throw new Error('Unexpected operation');
	expect(attempts[0].request.params.title).toBe('Untitled thread');
	expect(attempts[0].request.params.operationId).toMatch(/^[0-9a-f-]{36}$/u);
	await expect(retry).toHaveCount(0);
	expect(await list()).toHaveLength(before.length + 1);
	await page.unroute(rpcPath);
});

test('Agent tabs own independent local drafts and observe external threads through explicit reads', async ({
	page,
	context,
}) => {
	await loginAsInitialAdmin(context.request);
	await setUiLanguage(context.request);
	const app = await createTestAgentApp(context.request);
	await enableTestAgentExecution(context.request);
	const initialThread = await requestAgentWorkspace(context.request, app, {
		method: 'agent.threads.create',
		params: { autoTitle: false, operationId: randomUUID(), title: 'Shared initial conversation' },
	});
	if (initialThread.method !== 'agent.threads.create') throw new Error('Unexpected initial thread');
	let sockets = 0;
	context.on('page', (opened) =>
		opened.on('websocket', (socket) => {
			if (new URL(socket.url()).pathname === '/ws/agent') sockets += 1;
		}),
	);
	page.on('websocket', (socket) => {
		if (new URL(socket.url()).pathname === '/ws/agent') sockets += 1;
	});
	await page.goto('/connections');
	await openAgentHub(page);
	const follower = await context.newPage();
	try {
		await follower.goto('/connections');
		await openAgentHub(follower);
		await openAgentConversations(page);
		await openAgentConversations(follower);
		const firstHub = agentChatSurface(page, app.id);
		const secondHub = agentChatSurface(follower, app.id);
		const secondThreads = secondHub.locator('#agent-thread-sidebar');
		await firstHub
			.locator('#agent-thread-sidebar')
			.getByRole('button')
			.filter({ has: page.getByText(initialThread.value.title, { exact: true }) })
			.click();
		await secondThreads
			.getByRole('button')
			.filter({ has: follower.getByText(initialThread.value.title, { exact: true }) })
			.click();
		const firstDraft = firstHub.getByRole('textbox', { name: 'Task input', exact: true });
		const secondDraft = secondHub.getByRole('textbox', { name: 'Task input', exact: true });
		await secondDraft.fill('Follower draft');
		await firstDraft.fill('Leader draft');
		const result = await requestAgentWorkspace(context.request, app, {
			method: 'agent.threads.create',
			params: { autoTitle: false, operationId: randomUUID(), title: 'External thread' },
		});
		if (result.method !== 'agent.threads.create') throw new Error('Unexpected thread');
		await agentHost(follower).getByRole('button', { name: 'Minimize Agent', exact: true }).click();
		await openAgentHub(follower);
		await openAgentConversations(follower);
		await expect(
			secondThreads.getByRole('button').filter({ has: follower.getByText('External thread', { exact: true }) }),
		).toBeVisible();
		await expect(secondDraft).toHaveValue('Follower draft');
		await expect(firstDraft).toHaveValue('Leader draft');
		expect(sockets).toBe(0);
	} finally {
		await follower.close();
	}
});

test('empty Agent chat creates one thread on first send and retains the draft after a rejected creation', async ({
	page,
	context,
}) => {
	await loginAsInitialAdmin(context.request);
	await setUiLanguage(context.request);
	const prepared = await prepareAgentRun(context.request);
	await requestAgentWorkspace(context.request, prepared.app, {
		method: 'agent.threads.delete',
		params: { threadId: prepared.thread.id, expectedVersion: prepared.thread.version },
	});
	const commands: AgentWorkspaceRequest['request'][] = [];
	const gate = Promise.withResolvers<void>();
	let creates = 0;
	const rpcPath = `**/api/v1/agent/plugins/installations/${prepared.app.id}/frontend/rpc`;
	await page.route(rpcPath, async (route) => {
		const { envelope } = readAgentPluginFrontendRpc(route.request().postDataJSON());
		const command = envelope.request;
		if (command.method === 'agent.threads.create') {
			commands.push(command);
			creates += 1;
			if (creates === 1) {
				await route.fulfill({
					status: 200,
					json: {
						type: 'nexus.plugin.response',
						protocol: 4,
						nonce: envelope.nonce,
						id: envelope.id,
						seq: envelope.seq,
						ok: false,
						error: { code: 'invalid_input' },
					},
				});
				return;
			}
			await gate.promise;
		} else if (command.method === 'agent.runs.create') commands.push(command);
		await route.continue();
	});
	try {
		await page.goto('/connections');
		await openAgentHub(page);
		await selectAgentApp(page, prepared.app);
		const hub = agentChatSurface(page, prepared.app.id);
		const composer = hub.getByRole('textbox', { name: 'Task input', exact: true });
		await expect(composer).toBeEnabled();
		expect(creates).toBe(0);
		await selectAgentModel(page, prepared.provider);
		await composer.fill('Reply OK without using tools.');
		const send = hub.locator('.agent-send-button');
		await send.click();
		await expect.poll(() => creates).toBe(1);
		await expect(composer).toBeEnabled();
		await expect(composer).toHaveValue('Reply OK without using tools.');
		expect(commands.filter((item) => item.method === 'agent.runs.create')).toHaveLength(0);
		await send.click();
		await expect.poll(() => creates).toBe(2);
		await expect(send).toBeDisabled();
		await hub.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
		expect(creates).toBe(2);
		gate.resolve();
		await expect(composer).toHaveValue('');
		await expect.poll(() => commands.filter((item) => item.method === 'agent.runs.create').length).toBe(1);
		const threads = await requestAgentWorkspace(context.request, prepared.app, {
			method: 'agent.threads.list',
			params: { after: null, limit: 20 },
		});
		if (threads.method !== 'agent.threads.list') throw new Error('Unexpected thread list');
		expect(threads.value.items).toHaveLength(1);
		const create = commands.findLast((item) => item.method === 'agent.threads.create');
		if (create?.method !== 'agent.threads.create') throw new Error('Missing create command');
		expect(create.params.autoTitle).toBe(true);
	} finally {
		gate.resolve();
		await page.unroute(rpcPath, { behavior: 'wait' });
	}
});
