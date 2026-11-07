import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readAgentPluginManifest } from '@nexus-terminal/shared/agent/plugins/http-codec';
import { definitions } from '../src/definitions.mjs';
import { openPackageRuntime } from '../../../scripts/test-runtime.mjs';
import { decodeInput } from '../src/input.mjs';
import { executeBrowser } from '../src/operations.mjs';

const sessionId = '00000000-0000-4000-8000-000000000001';
const snapshotId = '00000000-0000-4000-8000-000000000002';
const artifactId = '00000000-0000-4000-8000-000000000003';
const runId = '00000000-0000-4000-8000-000000000004';
const sha256 = 'a'.repeat(64);
const capture = { artifactId, version: 3, sha256, sizeBytes: 123, mediaType: 'image/png' };
const semantic = {
	snapshotId,
	url: 'https://allowed.example/',
	title: 'Untrusted page',
	nodes: [{ ref: '7', parentRef: null, tag: 'button', text: 'Run', attributes: [{ name: 'type', value: 'button' }] }],
	truncated: false,
};
const consoleData = {
	entries: [{ sequence: 8, type: 'log', text: 'untrusted console entry' }],
	nextCursor: 8,
	truncated: false,
};

function reply(operation) {
	switch (operation) {
		case 'browser.catalog':
			return {
				targets: [
					{ targetId: 'review', expectedVersion: 2, allowedUrlPatterns: ['https://allowed.example/*'] },
				],
			};
		case 'browser.open':
			return { sessionId, targetId: 'review', targetVersion: 2, runId, createdAt: 1 };
		case 'browser.close':
			return { status: 'closed' };
		case 'browser.snapshot':
			return semantic;
		case 'browser.screenshot':
		case 'browser.download':
			return capture;
		case 'browser.console':
			return consoleData;
		default:
			return { kind: 'page', url: 'https://allowed.example/', title: 'Untrusted page' };
	}
}

const node = { sessionId, snapshotId, nodeRef: '7' };
const cases = [
	['browser_targets_list', {}, { operation: 'browser.catalog' }],
	[
		'browser_open',
		{ targetId: 'review', expectedVersion: 2 },
		{ operation: 'browser.open', targetId: 'review', expectedVersion: 2 },
	],
	['browser_close', { sessionId }, { operation: 'browser.close', sessionId }],
	['browser_snapshot', { sessionId }, { operation: 'browser.snapshot', sessionId, maxNodes: 256 }],
	['browser_screenshot', { sessionId }, { operation: 'browser.screenshot', sessionId }],
	['browser_console', { sessionId }, { operation: 'browser.console', sessionId, after: 0, limit: 50 }],
	[
		'browser_navigate',
		{ sessionId, url: 'https://allowed.example/next' },
		{ operation: 'browser.navigate', sessionId, settleMs: 250, url: 'https://allowed.example/next' },
	],
	['browser_back', { sessionId }, { operation: 'browser.back', sessionId, settleMs: 250 }],
	[
		'browser_scroll',
		{ sessionId, deltaY: -20 },
		{ operation: 'browser.scroll', sessionId, settleMs: 250, deltaX: 0, deltaY: -20 },
	],
	[
		'browser_press',
		{ sessionId, key: 'Enter' },
		{ operation: 'browser.press', sessionId, settleMs: 250, key: 'Enter', focus: null, modifiers: [] },
	],
	[
		'browser_select',
		{ ...node, values: [''] },
		{ operation: 'browser.select', sessionId, settleMs: 250, snapshotId, nodeRef: '7', values: [''] },
	],
	[
		'browser_wait',
		{ sessionId, mode: 'networkIdle', maxMillis: 1000 },
		{ operation: 'browser.wait', sessionId, mode: 'networkIdle', maxMillis: 1000 },
	],
	['browser_click', node, { operation: 'browser.click', sessionId, settleMs: 250, snapshotId, nodeRef: '7' }],
	[
		'browser_type',
		{ ...node, text: '', settleMs: 0 },
		{ operation: 'browser.type', sessionId, settleMs: 0, snapshotId, nodeRef: '7', text: '' },
	],
	[
		'browser_upload',
		{ ...node, artifactId, expectedVersion: 3, sha256 },
		{
			operation: 'browser.upload',
			sessionId,
			settleMs: 250,
			snapshotId,
			nodeRef: '7',
			artifactId,
			expectedVersion: 3,
			sha256,
		},
	],
	[
		'browser_download',
		{ ...node, maxBytes: 1024 },
		{ operation: 'browser.download', sessionId, snapshotId, nodeRef: '7', maxBytes: 1024 },
	],
];

test('All sixteen browser tools use fixed canonical actions and keep model projection in the package', async () => {
	const manifest = readAgentPluginManifest(
		JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8')),
	);
	assert.deepEqual(
		definitions.map((tool) => tool.key.split('.').at(-1)),
		cases.map(([name]) => name),
	);
	for (const [name, args, expected] of cases) {
		const requests = [];
		const output = await executeBrowser(
			name,
			decodeInput(name, JSON.stringify(args)),
			async (request) => {
				requests.push(request);
				return { ...reply(request.operation), privateRuntimeHandle: 'must not escape' };
			},
			new AbortController().signal,
		);
		assert.deepEqual(requests, [expected], name);
		assert.equal(JSON.stringify(output).includes('privateRuntimeHandle'), false, name);
		assert.equal(manifest.contributions.tools, true);
		const definition = definitions.find((tool) => tool.key.endsWith('.' + name));
		assert.equal(definition.execution, 'managed');
		assert.equal(definition.tags.includes('loader'), false);
		for (const retired of ['capability', 'risk', 'mutation', 'scheduling', 'hostOperations']) {
			assert.equal(Object.hasOwn(definition, retired), false);
		}
		const rpcRequests = [];
		const runtime = await openPackageRuntime('nexus.tools.browser', async (request) => {
			rpcRequests.push(request);
			return reply(request.operation);
		});
		const runtimeOutput = await runtime.invoke(name, args);
		assert.deepEqual(rpcRequests, [expected]);
		if (name === 'browser_snapshot') {
			assert.ok(runtimeOutput.startedAt <= runtimeOutput.snapshotAt);
			runtimeOutput.startedAt = output.startedAt;
			runtimeOutput.snapshotAt = output.snapshotAt;
		}
		assert.deepEqual(runtimeOutput, output);
		await runtime.close();
	}
});

test('Snapshot observations are composed sequentially in the package with independent capture times', async () => {
	const requests = [];
	const args = { sessionId, maxNodes: 64, include: ['console', 'screenshot'], after: 7, limit: 10 };
	const value = await executeBrowser(
		'browser_snapshot',
		decodeInput('browser_snapshot', JSON.stringify(args)),
		async (request) => {
			requests.push(request);
			return reply(request.operation);
		},
		new AbortController().signal,
	);
	assert.deepEqual(requests, [
		{ operation: 'browser.snapshot', sessionId, maxNodes: 64 },
		{ operation: 'browser.screenshot', sessionId },
		{ operation: 'browser.console', sessionId, after: 7, limit: 10 },
	]);
	assert.deepEqual(value.nodes, semantic.nodes);
	assert.deepEqual(value.screenshot.artifact, capture);
	assert.deepEqual(value.console.entries, consoleData);
	assert.ok(
		value.startedAt <= value.snapshotAt &&
			value.snapshotAt <= value.screenshot.capturedAt &&
			value.screenshot.capturedAt <= value.console.capturedAt,
	);
});

test('Snapshot failure and cancellation stop remaining observations and never replay an earlier action', async () => {
	const decoded = decodeInput('browser_snapshot', JSON.stringify({ sessionId, include: ['screenshot', 'console'] }));
	const failure = new Error('independent screenshot capture failed');
	const calls = [];
	await assert.rejects(
		executeBrowser(
			'browser_snapshot',
			decoded,
			async (request) => {
				calls.push(request.operation);
				if (request.operation === 'browser.screenshot') {
					throw failure;
				}
				return semantic;
			},
			new AbortController().signal,
		),
		(error) => error === failure,
	);
	assert.deepEqual(calls, ['browser.snapshot', 'browser.screenshot']);
	const abort = new AbortController();
	let dispatched = 0;
	await assert.rejects(
		executeBrowser(
			'browser_snapshot',
			decoded,
			async () => {
				dispatched++;
				abort.abort();
				return semantic;
			},
			abort.signal,
		),
		{ name: 'AbortError' },
	);
	assert.equal(dispatched, 1);
});

test('Browser model validation rejects malformed focus, duplicate options and additional model fields', () => {
	for (const [name, args] of [
		['browser_open', { targetId: 'review', expectedVersion: 2, endpoint: 'https://bypass.example/' }],
		['browser_snapshot', { sessionId, include: ['console', 'console'] }],
		['browser_press', { sessionId, key: 'Enter', snapshotId }],
		['browser_press', { sessionId, key: 'Enter', modifiers: ['Alt', 'Alt'] }],
		['browser_type', { ...node, nodeRef: 'button', text: 'bad' }],
		['browser_upload', { ...node, artifactId, expectedVersion: 3, sha256: 'bad' }],
		['browser_click', { ...node, settleMs: 2001 }],
	]) {
		assert.throws(() => decodeInput(name, JSON.stringify(args)), { code: 'invalid_input' });
	}
});

test('The package runtime rejects malformed Host replies and preserves typed refusal without retry', async (t) => {
	let calls = 0;
	for (const response of [{ text: '{}' }, { ...capture, handle: 'private' }, { failure: 'operation_unknown' }]) {
		const runtime = await openPackageRuntime('nexus.tools.browser', async () => {
			calls++;
			return response;
		});
		t.after(() => runtime.close());
		await assert.rejects(
			runtime.invoke('browser_screenshot', { sessionId }),
			response.failure ? { code: response.failure } : undefined,
		);
	}
	assert.equal(calls, 3);
});
