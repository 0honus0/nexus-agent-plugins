import assert from 'node:assert/strict';
import { test } from 'node:test';
import { McpProtocolSession } from '../../src/protocol.mjs';
import { endpoint } from '../support/mcp-endpoint.mjs';

const methods = [
	{ kind: 'tool', name: 'echo', method: 'tools/call' },
	{ kind: 'resource', name: 'fixture://document', method: 'resources/read' },
	{ kind: 'prompt', name: 'greeting', method: 'prompts/get' },
];

const requests = {
	confirmation: {
		method: 'elicitation/create',
		params: {
			message: 'Untrusted external question',
			requestedSchema: { type: 'object', properties: { answer: { type: 'string' } } },
		},
	},
	sampling: {
		method: 'sampling/createMessage',
		params: { messages: [{ role: 'user', content: { type: 'text', text: '外部内容' } }], maxTokens: 12 },
	},
	roots: { method: 'roots/list' },
	rootsWithMeta: { method: 'roots/list', params: { _meta: { fixture: 'remote-value' } } },
};

async function invoke(entry, inputRequests) {
	const server = endpoint((_params, method) => {
		assert.equal(method, entry.method);
		return { resultType: 'input_required', requestState: 'local-scoped-continuation', inputRequests };
	});
	const session = new McpProtocolSession({
		protocolVersion: '2026-07-28',
		client: { name: 'contract', version: '1' },
	});
	const signal = new AbortController().signal;
	try {
		await session.attach(server.fetch, signal);
		const result = await session.invoke(
			{ kind: entry.kind, name: entry.name, argumentsJson: '{}', resume: null },
			signal,
		);
		assert.equal(result.kind, 'input_required');
		assert.equal(result.requestState, 'local-scoped-continuation');
		assert.equal(server.calls.filter((call) => call.method === entry.method).length, 1);
		assert.equal(
			server.calls.some((call) => Object.values(requests).some((request) => request.method === call.method)),
			false,
			'External requests must remain manual; no implicit sampling, elicitation or roots dispatch',
		);
		return JSON.parse(result.inputRequestsJson);
	} finally {
		await session.dispose();
	}
}

await test('MCP tool/resource/prompt preserve complete request-id maps through the official SDK', async (t) => {
	for (const entry of methods) {
		await t.test(entry.kind, async () => {
			assert.deepEqual(await invoke(entry, requests), requests);
		});
	}
});

await test('MCP tool/resource/prompt normalize all state-only map shapes without implicit replay', async (t) => {
	for (const entry of methods) {
		for (const inputRequests of [undefined, null, [], [{ id: 'confirmation' }], 'remote text', 1]) {
			await t.test(entry.kind + ':' + JSON.stringify(inputRequests), async () => {
				assert.deepEqual(await invoke(entry, inputRequests), {});
			});
		}
	}
});
