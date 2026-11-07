import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PluginCapabilityFailure } from '../../../sdk/backend-v4.mjs';
import { run } from './run.mjs';
import { AUTO_SUMMARY_PREFIX, SUMMARY_INSTRUCTIONS } from './instructions.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');

const assistant = (content, toolCalls = [], reasoning = []) => ({ role: 'assistant', content, toolCalls, reasoning });

/** Exercise the actual App against an in-memory Host port. Host SQL authority,
 * corruption and drainage are independently covered in the host repository. */
async function fixture({ history = null, window = 131072, autoTitle = false, model, interrupt = false } = {}) {
	const selection = {
		providerId: randomUUID(),
		modelId: 'fixture',
		configurationVersion: 1,
		reasoningEffort: 'high',
	};
	const descriptor = {
		protocol: 'responses',
		contextWindow: window,
		maxOutputTokens: 256,
		supportsTools: true,
		supportsImageInput: false,
		reasoningEfforts: ['high'],
		chosenReasoningEffort: 'high',
	};
	const options = { instructions: 'Original App instructions', compactionMode: 'balanced' };
	const texts = new Map();
	const contentKeys = new Map();
	const receipts = new Map();
	const calls = [];
	const dispatches = [];
	let checkpoint = null;
	let shouldInterrupt = interrupt;

	async function put(key, text, mediaType) {
		const old = contentKeys.get(key);
		if (old) {
			assert.equal(texts.get(old.id), text, 'A saved content key cannot change bytes');
			assert.equal(old.mediaType, mediaType);
			return structuredClone(old);
		}
		const reference = { id: randomUUID(), sha256: hash(text), sizeBytes: Buffer.byteLength(text), mediaType };
		texts.set(reference.id, text);
		contentKeys.set(key, reference);
		return structuredClone(reference);
	}

	const prior =
		history === null
			? null
			: {
					schema: 4,
					options,
					pendingSummary: null,
					messages: history.messages,
					iteration: 0,
					loadedKeys: [],
					descriptor,
					phase: { kind: history.done === false ? 'prepare' : 'done' },
					resultText: '',
				};
	const historyRef =
		prior === null
			? null
			: await put('previous-state', JSON.stringify(prior), 'application/vnd.nexus.agent-state+json');
	const context = {
		identity: { appId: randomUUID() },
		signal: new AbortController().signal,
		configuration: {
			read: async () => ({ configuration: { revision: 0 }, settings: { defaultsJson: JSON.stringify(options) } }),
		},
		content: {
			put,

			text: async (reference) => {
				const text = texts.get(reference.id);
				assert.equal(hash(text), reference.sha256);
				return text;
			},
		},
		run: {
			describe: async () => ({
				prompt: 'Current request',
				sequence: 1,
				autoTitle,
				threadVersion: 1,
				outputPreviewBytes: 4096,
			}),

			readCheckpoint: async () => structuredClone(checkpoint),

			history: async () => ({
				items: historyRef === null ? [] : [{ checkpoint: { state: historyRef } }],
				nextBefore: null,
			}),

			checkpoint: async (input) => {
				assert.equal(input.expectedVersion, checkpoint?.version ?? 0);
				if (shouldInterrupt && input.consumedOperationIds.length) {
					shouldInterrupt = false;
					throw new Error('Controlled interruption before checkpoint commit');
				}
				checkpoint = {
					version: input.expectedVersion + 1,
					state: input.state,
					consumedOperationIds: input.consumedOperationIds,
					pendingIntents: input.pendingIntents,
				};
				return structuredClone(checkpoint);
			},

			setTitle: async (request) => {
				context.titles.push(request);
				return { operationId: randomUUID(), updated: true };
			},

			append: async () => {
				throw new Error('Model-only App must use Host model presentation');
			},
		},

		perform: async (_key, request) => ({
			value: request.operation === 'targets.list' ? [] : { items: [], nextOffset: null },
		}),

		directory: { discover: async () => ({ entries: [], nextCursor: null }) },
		models: {
			describe: async () => structuredClone(descriptor),

			invoke: async (request) => {
				calls.push(structuredClone(request));
				const saved = receipts.get(request.operationKey);
				if (saved) {
					assert.deepEqual(request, saved.request, 'Resume must use the exact frozen model request');
					return structuredClone(saved.result);
				}
				const messages = JSON.parse(await context.content.text(request.messages));
				dispatches.push({ request: structuredClone(request), messages });
				const body = await model({ request, messages, index: dispatches.length - 1 });
				const result = {
					operationId: randomUUID(),
					body: await put('response:' + request.operationKey, JSON.stringify(body), 'application/json'),
					inputTokens: 10,
					outputTokens: 5,
				};
				receipts.set(request.operationKey, { request: structuredClone(request), result });
				return structuredClone(result);
			},
		},
		titles: [],
	};
	return {
		context,
		input: { model: selection, artifacts: [] },
		calls,
		dispatches,

		state: async () => JSON.parse(await context.content.text(checkpoint.state)),

		checkpoint: () => structuredClone(checkpoint),
	};
}

const answer = (text = 'Final answer', reasoning = []) => ({ text, finishReason: 'stop', toolCalls: [], reasoning });

await test('App resumes the exact model request and consumes its original receipt without duplicate dispatch', async () => {
	const reasoning = [{ id: 'rs_saved', encryptedContent: 'private-中文', summary: ['retained summary'] }];
	const f = await fixture({
		interrupt: true,

		model: () => answer('Final answer', reasoning),
	});
	await assert.rejects(run(f.input, f.context), /Controlled interruption/);
	const before = f.checkpoint();
	assert.equal((await f.state()).phase.kind, 'exchange');
	assert.equal(before.pendingIntents.length, 1);
	const resumed = await run(f.input, f.context);
	assert.equal(resumed.kind, 'complete');
	assert.equal(f.calls.length, 2);
	assert.equal(f.dispatches.length, 1);
	assert.deepEqual(f.calls[0], f.calls[1]);
	assert.equal((await f.state()).phase.kind, 'done');
	assert.deepEqual((await f.state()).messages.at(-1).reasoning, reasoning);
	assert.equal(f.checkpoint().consumedOperationIds.length, 1);
	assert.deepEqual(f.checkpoint().pendingIntents, []);
});

function longHistory() {
	const calls = [
		{ id: 'call-a', name: 'read_a', argumentsJson: '{"path":"/exact/a"}' },
		{ id: 'call-b', name: 'read_b', argumentsJson: '{"path":"/exact/b"}' },
	];
	return [
		{ role: 'user', content: 'A'.repeat(24000) },
		assistant('Original first answer'),
		{ role: 'user', content: 'B'.repeat(24000) },
		assistant('Read both', calls, [{ id: 'rs_tools', encryptedContent: 'encrypted', summary: ['read plan'] }]),
		{ role: 'tool', callId: 'call-a', content: 'a'.repeat(6000) },
		{ role: 'tool', callId: 'call-b', content: 'b'.repeat(6000) },
		{ role: 'user', content: 'C'.repeat(24000) },
		assistant('Retained tail answer'),
	];
}

await test('Automatic compaction checkpoints exact source and preserves the complete tool group, reasoning and retained tail', async () => {
	const messages = longHistory();
	const f = await fixture({
		history: { messages },
		window: 20000,
		interrupt: true,

		model: ({ request }) =>
			answer(request.visible ? 'Final answer' : 'Exact original decisions and outstanding work'),
	});
	await assert.rejects(run(f.input, f.context), /Controlled interruption/);
	const frozen = await f.state();
	assert.equal(frozen.phase.purpose, 'compact');
	assert.deepEqual(frozen.messages, [...messages, { role: 'user', content: 'Current request' }]);
	const prefix = JSON.parse(f.dispatches[0].messages[0].content.slice(SUMMARY_INSTRUCTIONS.length));
	assert.deepEqual(prefix, messages.slice(0, 2));
	assert.equal(frozen.phase.cut, 2);
	await run(f.input, f.context);
	assert.equal(f.dispatches.length, 2, 'A resumed summary does not invoke a second paid model request');
	assert.deepEqual(f.calls[0], f.calls[1]);
	assert.deepEqual(f.dispatches[1].messages, [
		{ role: 'user', content: AUTO_SUMMARY_PREFIX + 'Exact original decisions and outstanding work' },
		...messages.slice(2),
		{ role: 'user', content: 'Current request' },
	]);
	assert.equal((await f.state()).resultText, 'Final answer');
});

for (const summary of ['', 'X'.repeat(100000)]) {
	await test(`Unusable ${summary ? 'oversized' : 'empty'} semantic summary fails without replacing original messages`, async () => {
		const messages = longHistory();
		const f = await fixture({
			history: { messages },
			window: 20000,

			model: () => answer(summary),
		});
		await assert.rejects(
			run(f.input, f.context),
			(error) => error instanceof PluginCapabilityFailure && error.code === 'limit_exceeded',
		);
		assert.deepEqual((await f.state()).messages, [...messages, { role: 'user', content: 'Current request' }]);
		assert.equal(f.dispatches.length, 1);
	});
}

await test('Consecutive useful compactions bind separate source identities while keeping original receipts stable', async () => {
	let summaries = 0;
	const f = await fixture({
		history: { messages: longHistory() },
		window: 20000,

		model: ({ request }) =>
			answer(request.visible ? 'Final answer' : ++summaries === 1 ? 'S'.repeat(8000) : 'Short final summary'),
	});
	await run(f.input, f.context);
	assert.equal(summaries, 2);
	assert.equal(f.dispatches.length, 3);
	assert.equal(new Set(f.dispatches.map((call) => call.request.operationKey)).size, 3);
	assert.equal((await f.state()).resultText, 'Final answer');
});

await test('Incomplete earlier execution is quoted as untrusted history instead of replaying unfinished tool proposals', async () => {
	const previous = [
		{ role: 'user', content: 'Original task' },
		assistant('About to write', [{ id: 'old-write', name: 'write', argumentsJson: '{"path":"/old"}' }]),
	];
	const f = await fixture({
		history: { messages: previous, done: false },

		model: () => answer(),
	});
	await run(f.input, f.context);
	const messages = f.dispatches[0].messages;
	assert.equal(messages.length, 2);
	assert.ok(messages[0].content.includes('untrusted history'));
	assert.ok(messages[0].content.endsWith(JSON.stringify(previous)));
	assert.deepEqual(messages[1], { role: 'user', content: 'Current request' });
	assert.equal(f.dispatches[0].request.tools.length, 0);
});

await test('Mismatched saved intent rejects before dispatch', async () => {
	const f = await fixture({
		interrupt: true,

		model: () => answer(),
	});
	await assert.rejects(run(f.input, f.context), /Controlled interruption/);
	const saved = f.checkpoint();
	saved.pendingIntents[0].requestSha256 = 'f'.repeat(64);
	f.context.run.readCheckpoint = async () => saved;
	await assert.rejects(
		run(f.input, f.context),
		(error) => error instanceof PluginCapabilityFailure && error.code === 'version_conflict',
	);
	assert.equal(f.calls.length, 1);
});

for (const code of ['provider_request_failed', 'operation_unknown', 'storage_unavailable']) {
	await test(`Title ${code} preserves confirmed answer and keeps real uncertainty visible`, async () => {
		const f = await fixture({
			autoTitle: true,

			model: ({ request }) => {
				if (!request.visible) {
					throw new PluginCapabilityFailure(code);
				}
				return answer();
			},
		});
		if (code === 'provider_request_failed') {
			await run(f.input, f.context);
			assert.equal((await f.state()).phase.kind, 'done');
			assert.equal(f.context.titles.length, 1);
		} else {
			await assert.rejects(
				run(f.input, f.context),
				(error) => error instanceof PluginCapabilityFailure && error.code === code,
			);
			assert.equal((await f.state()).phase.purpose, 'title');
			assert.equal(f.context.titles.length, 0);
		}
		assert.equal((await f.state()).resultText, 'Final answer');
	});
}
