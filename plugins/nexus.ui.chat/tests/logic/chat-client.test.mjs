import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createPlatform } from '../../src/platform/client';
import { installAgentChatUiPlatform } from '../../src/features/agent/chat-ui/platform';
import { subscribeNativeRun } from '../../src/features/agent/api/native-run-stream';
import { PluginUiRequestFailure } from 'nexus:frontend-sdk';

const client = { createPlatform, installAgentChatUiPlatform, subscribeNativeRun, PluginUiRequestFailure };

test('A named SDK write failure keeps its unknown outcome through the actual UI request adapter', async () => {
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
