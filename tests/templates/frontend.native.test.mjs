import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAgentPluginFrontendInput } from '@nexus-terminal/shared/agent/plugins/frontend-rpc-codec';
import { openPackageRuntime } from '../support/packages/package-runtime.mjs';
import { listPage, textPage } from '../support/packages/remote-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('third-party frontend fences a storage write whose outcome is unknown', async () => {
	const elements = new Map();
	for (const name of [
		'fullstack-frontend-status',
		'fullstack-backend-status',
		'fullstack-write-storage',
		'fullstack-storage-result',
	]) {
		elements.set(`[data-testid="${name}"]`, {
			textContent: '',
			disabled: false,

			addEventListener(event, listener) {
				this[event] = listener;
			},
		});
	}
	const document = { querySelector: (selector) => elements.get(selector) };
	const sdk = {
		async request(input) {
			if (input.method === 'storage.put') {
				const failure = new Error('operation_unknown');
				failure.outcomeUnknown = true;
				throw failure;
			}
			return {
				method: input.method,
				value: input.method === 'host.appInfo' ? { appId: 'example.thirdparty', version: '2.0.0' } : null,
			};
		},

		async close() {},
	};
	const source = fs
		.readFileSync(path.join(root, 'templates/fullstack/frontend/app.mjs'), 'utf8')
		.replace("import { connectNexusPlugin } from '/sdk/frontend-v4.mjs';", '');
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	const execute = new AsyncFunction('connectNexusPlugin', 'document', 'window', 'crypto', source);
	await execute(async () => sdk, document, { addEventListener() {} }, globalThis.crypto);
	const button = elements.get('[data-testid="fullstack-write-storage"]');
	await button.click();
	assert.equal(button.disabled, true);
	assert.match(elements.get('[data-testid="fullstack-storage-result"]').textContent, /operation_unknown/);
});

test('inspection App submits a target-bound form, reuses the real remote algorithm and renders its report', async () => {
	const nodes = new Map();

	const makeNode = () => ({
		value: '',
		textContent: '',
		disabled: false,
		children: [],

		append(child) {
			this.children.push(child);
		},

		replaceChildren() {
			this.children = [];
		},

		addEventListener(name, callback) {
			this[name] = callback;
		},
	});

	for (const id of [
		'inspection-form',
		'inspect',
		'status',
		'report',
		'approvals',
		'refresh',
		'model',
		'connection',
		'directory',
	]) {
		nodes.set(id, makeNode());
	}
	nodes.get('connection').value = '1';
	nodes.get('directory').value = '/project';
	nodes.get('model').value = '0';
	const calls = [];
	let reportText = '';
	const remote = await openPackageRuntime('nexus.tools.remote', async (input) =>
		input.operation === 'remote.listPage'
			? listPage(['package.json'])
			: textPage(input, JSON.stringify({ name: 'inspection-fixture', scripts: { check: 'tsc' } })),
	);
	const sdk = {
		async request(input) {
			readAgentPluginFrontendInput(input);
			calls.push(input);
			let value;
			if (input.method === 'agent.providers.list') {
				value = [
					{
						providerId: '11111111-1111-4111-8111-111111111111',
						providerDisplayName: 'Provider',
						modelId: 'model',
						configurationVersion: 1,
					},
				];
			} else if (input.method === 'agent.threads.create') {
				value = { id: '22222222-2222-4222-8222-222222222222' };
			} else if (input.method === 'agent.runs.create') {
				assert.deepEqual(input.params.input.connectionIds, [1]);
				assert.equal(input.params.input.approvalMode, 'ask');
				assert.match(input.params.input.prompt, /remote_project_inspect/);
				reportText = JSON.stringify(
					await remote.invoke('remote_project_inspect', { connectionId: 1, directory: '/project' }),
				);
				value = { run: { id: '33333333-3333-4333-8333-333333333333' } };
			} else if (input.method === 'agent.threads.entries') {
				value = {
					items: [{ role: 'assistant', text: reportText }],
					nextCursor: { runSequence: 1, messageOrdinal: 1, chunkIndex: 1, textOffset: reportText.length },
				};
			} else if (input.method === 'agent.runs.get') {
				value = { status: 'completed', failure: null };
			} else if (input.method === 'agent.approvals.list') {
				value = { items: [], hasMore: false, nextCursor: null };
			} else {
				throw new Error(`Unexpected SDK call: ${input.method}`);
			}
			return { method: input.method, value };
		},

		agent: {
			runs: {
				subscribe() {
					return { id: 'subscription' };
				},

				async unsubscribe() {},
			},
		},

		async close() {},
	};
	try {
		const source = fs
			.readFileSync(path.join(root, 'templates/project-inspection/frontend/app.mjs'), 'utf8')
			.replace("import { connectNexusPlugin } from '/sdk/frontend-v4.mjs';", '');
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		await new AsyncFunction('connectNexusPlugin', 'document', 'window', 'crypto', source)(
			async () => sdk,
			{
				getElementById: (id) => nodes.get(id),

				createElement: makeNode,
			},
			{ addEventListener() {} },
			globalThis.crypto,
		);
		await nodes.get('inspection-form').submit({ preventDefault() {} });
		assert.equal(calls.filter((input) => input.method === 'agent.runs.create').length, 1);
		assert.match(nodes.get('report').textContent, /inspection-fixture/);
		assert.match(nodes.get('report').textContent, /recommendedChecks/);
		assert.equal(nodes.get('status').textContent, 'Inspection completed');
		assert.equal(nodes.get('inspect').disabled, false);
	} finally {
		await remote.close();
	}
});
