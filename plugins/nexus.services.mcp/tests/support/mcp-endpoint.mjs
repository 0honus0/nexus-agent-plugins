import assert from 'node:assert/strict';
import { MCP_SYNTHETIC_URL } from '../../src/protocol.mjs';

export function endpoint(tool = () => ({ content: [{ type: 'text', text: 'actual MCP reply' }] })) {
	const calls = [];

	const fetch = async (url, init) => {
		assert.equal(String(url), MCP_SYNTHETIC_URL);
		if (init.method === 'GET') {
			return new Response(null, { status: 405 });
		}
		if (init.method === 'DELETE') {
			return new Response(null, { status: 200 });
		}
		const message = JSON.parse(init.body);
		calls.push(message);
		if (!Object.hasOwn(message, 'id')) {
			return new Response(null, { status: 202 });
		}
		let result;
		if (message.method === 'server/discover') {
			result = {
				supportedVersions: ['2026-07-28'],
				capabilities: { tools: {}, resources: {}, prompts: {} },
				_meta: { 'io.modelcontextprotocol/serverInfo': { name: 'controlled', version: '1' } },
			};
		} else if (message.method === 'tools/list') {
			result = {
				ttlMs: 0,
				cacheScope: 'private',
				tools: [{ name: 'echo', inputSchema: { type: 'object', properties: {} } }],
			};
		} else if (message.method === 'resources/list') {
			result = { ttlMs: 0, cacheScope: 'private', resources: [] };
		} else if (message.method === 'prompts/list') {
			result = { ttlMs: 0, cacheScope: 'private', prompts: [] };
		} else if (['tools/call', 'resources/read', 'prompts/get'].includes(message.method)) {
			result = tool(message.params, message.method);
		} else {
			throw new Error('Unexpected MCP method ' + message.method);
		}
		if (message.method !== 'server/discover') {
			result.resultType ??= 'complete';
		}
		return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }), {
			headers: { 'content-type': 'application/json', 'mcp-session-id': 'test-session' },
		});
	};

	return { fetch, calls };
}
