import assert from 'node:assert/strict';
import { test } from 'node:test';
import { McpProtocolSession, MCP_SYNTHETIC_URL } from '../src/protocol.mjs';

function endpoint(tool = () => ({ content: [{ type: 'text', text: 'actual MCP reply' }] })) {
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
		} else if (message.method === 'tools/call') {
			result = tool(message.params);
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

await test('MCP SDK reuses modern negotiation across detached handler transports', async () => {
	const server = endpoint();
	const session = new McpProtocolSession({ protocolVersion: '2026-07-28', client: { name: 'test', version: '1' } });
	const signal = new AbortController().signal;
	try {
		await session.attach(server.fetch, signal);
		assert.equal((await session.discover(signal, true)).tools[0].name, 'echo');
		const result = await session.invoke({ kind: 'tool', name: 'echo', argumentsJson: '{}', resume: null }, signal);
		assert.match(result.resultJson, /actual MCP reply/);
		await session.detach();
		await session.attach(server.fetch, signal);
		assert.equal((await session.discover(signal, true)).serverName, 'controlled');
		assert.equal(
			server.calls.filter((call) => call.method === 'server/discover').length,
			1,
			'A new handler must reuse the negotiated protocol',
		);
	} finally {
		await session.dispose();
	}
});

await test('MCP SDK resumes actual input_required state across handler transports without implicit replay', async () => {
	const state = 'opaque-server-state:42';
	const server = endpoint((params) => {
		if (params.requestState === undefined) {
			return {
				resultType: 'input_required',
				requestState: state,
				inputRequests: {
					confirm: {
						method: 'elicitation/create',
						params: {
							message: 'Confirm',
							requestedSchema: { type: 'object', properties: { answer: { type: 'string' } } },
						},
					},
				},
			};
		}
		assert.equal(params.requestState, state);
		assert.deepEqual(params.inputResponses, { confirm: { action: 'accept', content: { answer: 'yes' } } });
		return { content: [{ type: 'text', text: 'explicitly resumed' }] };
	});
	const session = new McpProtocolSession({ protocolVersion: '2026-07-28', client: { name: 'test', version: '1' } });
	const signal = new AbortController().signal;
	const request = { kind: 'tool', name: 'echo', argumentsJson: '{}', resume: null };
	try {
		await session.attach(server.fetch, signal);
		const pending = await session.invoke(request, signal);
		assert.equal(pending.kind, 'input_required');
		assert.equal(pending.requestState, state);
		assert.equal(server.calls.filter((call) => call.method === 'tools/call').length, 1);
		await session.detach();
		await session.attach(server.fetch, signal);
		const complete = await session.invoke(
			{
				...request,
				resume: {
					requestState: pending.requestState,
					inputResponsesJson: JSON.stringify({ confirm: { action: 'accept', content: { answer: 'yes' } } }),
				},
			},
			signal,
		);
		assert.equal(complete.kind, 'complete');
		assert.match(complete.resultJson, /explicitly resumed/);
		assert.equal(server.calls.filter((call) => call.method === 'tools/call').length, 2);
		assert.equal(server.calls.filter((call) => call.method === 'server/discover').length, 1);
	} finally {
		await session.dispose();
	}
});

function contains(error, expected) {
	return (
		error === expected ||
		(error instanceof AggregateError && error.errors.some((item) => contains(item, expected))) ||
		(error instanceof Error && error.cause !== undefined && contains(error.cause, expected))
	);
}

await test('MCP negotiation retains its original failure when SDK transport cleanup also fails', async (t) => {
	const session = new McpProtocolSession({ protocolVersion: '2026-07-28', client: { name: 'test', version: '1' } });
	const primary = new Error('Controlled SDK negotiation failure');
	const cleanup = new Error('Controlled SDK transport close failure');
	t.mock.method(session.client, 'connect', async () => {
		throw primary;
	});
	const detach = session.detach.bind(session);
	t.mock.method(session, 'detach', async () => {
		await detach();
		throw cleanup;
	});
	await assert.rejects(
		session.attach(endpoint().fetch, new AbortController().signal),
		(error) => contains(error, primary) && contains(error, cleanup),
	);
	assert.equal(session.busy, false);
	assert.equal(session.transport, null);
});

await test('MCP dispose attempts independent SDK cleanup and preserves synchronous and asynchronous failures', async (t) => {
	const session = new McpProtocolSession({ protocolVersion: '2026-07-28', client: { name: 'test', version: '1' } });
	const detached = new Error('Controlled detach failure');
	const closed = new Error('Controlled synchronous SDK close failure');
	let attempted = 0;
	t.mock.method(session, 'detach', async () => {
		throw detached;
	});
	t.mock.method(session.client, 'close', () => {
		attempted++;
		throw closed;
	});
	await assert.rejects(session.dispose(), (error) => contains(error, detached) && contains(error, closed));
	assert.equal(attempted, 1);
});

await test('MCP SDK preserves large input, continuation state and full results', async () => {
	const argumentsJson = JSON.stringify({ text: 'input'.repeat(20000) });
	const responses = JSON.stringify({ confirm: { action: 'accept', content: { answer: 'yes'.repeat(4000) } } });
	const state = 'state'.repeat(3000);
	const resultText = 'output'.repeat(1500000);
	const server = endpoint((params) => {
		assert.deepEqual(params.arguments, JSON.parse(argumentsJson));
		assert.equal(params.requestState, state);
		assert.deepEqual(params.inputResponses, JSON.parse(responses));
		return { content: [{ type: 'text', text: resultText }] };
	});
	const session = new McpProtocolSession({
		protocolVersion: '2026-07-28',
		client: { name: 'capacity', version: '1' },
	});
	const signal = new AbortController().signal;
	try {
		await session.attach(server.fetch, signal);
		const result = await session.invoke(
			{
				kind: 'tool',
				name: 'echo',
				argumentsJson,
				resume: { requestState: state, inputResponsesJson: responses },
			},
			signal,
		);
		assert.equal(result.kind, 'complete');
		assert.equal(JSON.parse(result.resultJson).content[0].text, resultText);
	} finally {
		await session.dispose();
	}
});

await test(
	'MCP negotiation follows the Host deadline beyond the former 15 second handshake limit',
	{ timeout: 25000 },
	async () => {
		const server = endpoint();
		const session = new McpProtocolSession({
			protocolVersion: '2026-07-28',
			client: { name: 'test', version: '1' },
		});

		const fetch = async (url, init) => {
			if (init.method === 'POST' && JSON.parse(init.body).method === 'server/discover') {
				await new Promise((resolve) => setTimeout(resolve, 15500));
			}
			return server.fetch(url, init);
		};

		try {
			await session.attach(fetch, AbortSignal.timeout(22000));
			assert.equal((await session.discover(AbortSignal.timeout(5000), true)).tools[0].name, 'echo');
		} finally {
			await session.dispose();
		}
	},
);

await test(
	'MCP negotiation forwards Host cancellation into the actual transport request',
	{ timeout: 3000 },
	async () => {
		const session = new McpProtocolSession({
			protocolVersion: '2026-07-28',
			client: { name: 'test', version: '1' },
		});
		const controller = new AbortController();
		let cancelFetch;
		let observed = false;
		const entered = new Promise((resolve) => {
			cancelFetch = resolve;
		});

		const fetch = async (_url, init) => {
			cancelFetch();
			await new Promise((_resolve, reject) => {
				const abort = () => {
					observed = true;
					reject(init.signal.reason);
				};

				if (init.signal.aborted) {
					abort();
				} else {
					init.signal.addEventListener('abort', abort, { once: true });
				}
			});
		};

		const attaching = session.attach(fetch, controller.signal);
		const rejected = assert.rejects(attaching);
		await entered;
		controller.abort(new Error('Host fixture cancellation'));
		try {
			await rejected;
			assert.equal(observed, true);
			assert.equal(session.busy, false);
			assert.equal(session.transport, null);
		} finally {
			await session.dispose();
		}
	},
);

await test('MCP manual continuations validate embedded requests with official schemas before exposing them', async (t) => {
	const malformed = [
		null,
		[],
		'request',
		{},
		{ method: 'tools/call', params: {} },
		{ method: 'elicitation/create' },
		{ method: 'sampling/createMessage' },
		{ method: 'roots/list', params: null },
		{ method: 'roots/list', params: [] },
		{ method: 'elicitation/create', params: 'payload' },
		{ method: 'sampling/createMessage', params: 12 },
	];
	for (const request of malformed) {
		await t.test(JSON.stringify(request), async () => {
			const server = endpoint(() => ({
				resultType: 'input_required',
				requestState: 'pending',
				inputRequests: { bad: request },
			}));
			const session = new McpProtocolSession({
				protocolVersion: '2026-07-28',
				client: { name: 'test', version: '1' },
			});
			const signal = new AbortController().signal;
			try {
				await session.attach(server.fetch, signal);
				await assert.rejects(
					session.invoke({ kind: 'tool', name: 'echo', argumentsJson: '{}', resume: null }, signal),
					(error) => error.code === 'invalid_input',
				);
			} finally {
				await session.dispose();
			}
		});
	}
});

await test('MCP preserves SDK normalization of absent request maps without executing external requests', async () => {
	for (const inputRequests of [undefined, null, [], 'text', 1]) {
		const server = endpoint(() => ({ resultType: 'input_required', requestState: 'opaque', inputRequests }));
		const session = new McpProtocolSession({
			protocolVersion: '2026-07-28',
			client: { name: 'test', version: '1' },
		});
		const signal = new AbortController().signal;
		try {
			await session.attach(server.fetch, signal);
			const result = await session.invoke(
				{ kind: 'tool', name: 'echo', argumentsJson: '{}', resume: null },
				signal,
			);
			assert.equal(result.kind, 'input_required');
			assert.equal(result.inputRequestsJson, '{}');
			assert.equal(result.requestState, 'opaque');
			assert.equal(server.calls.filter((call) => call.method === 'tools/call').length, 1);
		} finally {
			await session.dispose();
		}
	}
});
