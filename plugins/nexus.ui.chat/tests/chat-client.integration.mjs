import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(join(tmpdir(), 'nexus-chat-client-'));
after(() => rm(output, { recursive: true, force: true }));
const entry = resolve(root, 'tests/client-entry.ts');
await build({
	configFile: false,
	root,
	logLevel: 'error',
	resolve: { alias: { '@': resolve(root, 'src') } },
	plugins: [
		{
			name: 'chat-client-test-entry',
			resolveId(source) {
				if (source === entry) return '\0' + entry;
				if (source === 'nexus:frontend-sdk') return '\0chat-test-sdk';
			},
			load(id) {
				if (id === '\0chat-test-sdk')
					return `export class PluginUiRequestFailure extends Error {
 constructor(code, outcome) { super(code); this.name='PluginUiRequestFailure'; this.code=code; this.outcome=outcome; }
}`;
				if (id !== '\0' + entry) return;
				return [
					'export { createPlatform } from "@/platform/client";',
					'export { installAgentChatUiPlatform } from "@/features/agent/chat-ui/platform";',
					'export { subscribeNativeRun } from "@/features/agent/api/native-run-stream";',
					'export { PluginUiRequestFailure } from "nexus:frontend-sdk";',
				].join('\n');
			},
		},
	],
	build: {
		outDir: output,
		emptyOutDir: true,
		minify: false,
		lib: { entry, formats: ['es'], fileName: () => 'client.mjs' },
	},
});

test('A named SDK write failure keeps its unknown outcome through the actual UI request adapter', async () => {
	const client = await import(pathToFileURL(join(output, 'client.mjs')).href);
	const original = new client.PluginUiRequestFailure('operation_unknown', 'unknown');
	const platform = client.createPlatform({
		ui: {
			environment: { appId: crypto.randomUUID(), appVersion: 1 },
			onEnvironment: () => () => {},
			onClose: () => () => {},
			onTaskOpen: () => () => {},
			request: async () => {
				throw original;
			},
		},
	});
	await assert.rejects(
		platform.request({ kind: 'window.open' }),
		(error) => error.code === 'operation_unknown' && error.outcome === 'unknown' && error.cause === original,
	);
	assert.equal(platform.closed.value, false);
	platform.dispose();
});

test('A completed native Run retires its real UI projection during apply and preserves independent work', async () => {
	const client = await import(pathToFileURL(join(output, 'client.mjs')).href);
	const appId = crypto.randomUUID(),
		threadId = crypto.randomUUID(),
		runId = crypto.randomUUID();
	const entries = { runSequence: 0, messageOrdinal: 0, chunkIndex: 0, textOffset: 0 };
	let consumer;
	let unsubscribed = false;
	let closeListener;
	const sdk = {
		ui: {
			environment: { appId, appVersion: 1 },
			onEnvironment: () => () => {},
			onTaskOpen: () => () => {},
			onClose(listener) {
				closeListener = listener;
				return () => {};
			},
			request: async (input) => ({ kind: input.kind, accepted: true }),
			streams: {
				subscribe(value) {
					consumer = value;
					return {
						resume() {},
						close() {
							unsubscribed = true;
						},
						closed: Promise.resolve(),
					};
				},
			},
		},
	};
	const platform = client.createPlatform(sdk);
	client.installAgentChatUiPlatform(platform);
	let applied = 0;
	const subscription = client.subscribeNativeRun(
		{ appId, appVersion: 1 },
		runId,
		() => ({ threadId, entries, events: 0, runVersion: 2 }),
		(update) => {
			assert.equal(update.state.run.status, 'completed');
			assert.deepEqual(update.state.resources, []);
			applied++;
			subscription.close();
			return true;
		},
		() => assert.fail('Valid completed Run page must not fail decoding'),
	);
	assert.deepEqual(consumer.source(), {
		kind: 'run',
		runId,
		cursor: { threadId, entries, events: 0, approvals: null },
	});
	const page = {
		type: 'update',
		appId,
		runId,
		revision: 1,
		body: { appId, threadId, items: [], nextCursor: entries },
		state: {
			thread: {
				id: threadId,
				appId,
				title: 'Completed conversation',
				version: 1,
				createdAt: 1,
				updatedAt: 1,
			},
			run: {
				id: runId,
				appId,
				threadId,
				status: 'completed',
				failure: null,
				approvalMode: 'ask',
				version: 2,
				createdAt: 1,
				updatedAt: 2,
			},
			usage: {
				runId,
				runVersion: 2,
				inputTokens: null,
				outputTokens: null,
				reportedModelRequests: 0,
				modelRequests: 1,
				toolExecutions: 0,
			},
			events: { items: [], nextCursor: 0 },
			approvals: { items: [], after: null, nextCursor: null, hasMore: false },
			children: { items: [] },
			resources: [],
		},
		more: false,
	};
	assert.equal(consumer.apply(page, 1), true);
	assert.equal(applied, 1);
	assert.equal(unsubscribed, true);
	assert.equal(platform.closed.value, false);
	assert.deepEqual(await platform.request({ kind: 'window.open' }), { kind: 'window.open', accepted: true });
	closeListener();
	assert.equal(platform.closed.value, true);
	platform.dispose();
});
