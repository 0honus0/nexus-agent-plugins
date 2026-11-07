import { searchDefinitions } from './discovery.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { imageModelPage, presentArtifacts, readToolResults } from './content.mjs';
import { decodeInput } from './input.mjs';
import { perform } from './perform.mjs';
import { TOOL_RESULT_MAX_BYTES } from '../../../lib/model-tools/limits.mjs';

const signal = new AbortController().signal;
const id = '11111111-1111-4111-8111-111111111111';
const hash = 'a'.repeat(64);

function invoke(name, args, call) {
	return perform(name, decodeInput(name, JSON.stringify(args)), call, signal, undefined, {
		run: { describe: async () => ({ inputJson: '{"model":{"providerId":"fixture"}}' }) },
	});
}

test('image catalog paging keeps authoritative configuration identities and exact continuation', () => {
	const models = Array.from({ length: 43 }, (_, index) => ({
		providerId: id,
		configurationVersion: 7,
		modelId: String(index),
	}));
	assert.deepEqual(imageModelPage(models, 20), { models: models.slice(20, 40), nextOffset: 40 });
	assert.deepEqual(imageModelPage(models, 40), { models: models.slice(40), nextOffset: null });
	assert.deepEqual(imageModelPage(models, 43), { models: [], nextOffset: null });
});

test('artifact text is encoded in the package and only atomic bytes reach Host', async () => {
	let request;
	const result = await invoke('artifact_create', { name: '报告.txt', content: '汉字😀\n' }, async (value) => {
		request = value;
		return { id, version: 2, status: 'ready', sizeBytes: 11, sha256: hash, privateField: 'excluded' };
	});
	assert.deepEqual(request, {
		operation: 'artifacts.create',
		name: '报告.txt',
		mediaType: 'text/plain',
		base64: Buffer.from('汉字😀\n', 'utf8').toString('base64'),
	});
	assert.deepEqual(result, { id, version: 2, status: 'ready', sizeBytes: 11, sha256: hash });
});

test('artifact presentation is single-item and bounds the complete response with nextIndex', async () => {
	const ids = Array.from({ length: 2000 }, (_, index) => String(index));
	const result = await presentArtifacts(
		ids,
		async (request) => {
			assert.equal(request.operation, 'artifacts.present');
			assert.equal(typeof request.artifactId, 'string');
			return { id: request.artifactId, name: '文'.repeat(256), sizeBytes: 17 };
		},
		signal,
	);
	assert.ok(result.nextIndex > 0 && result.nextIndex < ids.length);
	assert.equal(result.nextIndex, result.items.length);
	assert.ok(Buffer.byteLength(JSON.stringify(result)) <= TOOL_RESULT_MAX_BYTES);
	assert.equal(result.items[0].status, 'completed');
});

test('result pages use exact identities and offsets without rerunning a tool', async () => {
	const requests = Array.from({ length: 100 }, (_, index) => ({
		toolCallId: id,
		sha256: hash,
		offset: index,
		maxBytes: 4096,
	}));
	const result = await readToolResults(
		requests,
		async (request) => {
			assert.equal(request.operation, 'context.readResults');
			assert.deepEqual(request.item, requests[request.item.offset]);
			return {
				...request.item,
				originalBytes: 50000,
				nextOffset: request.item.offset + 1,
				text: '"'.repeat(2000),
			};
		},
		signal,
	);
	assert.equal(result.nextIndex, result.items.length);
	assert.ok(result.nextIndex < requests.length);
	assert.ok(Buffer.byteLength(JSON.stringify(result)) <= TOOL_RESULT_MAX_BYTES);
	assert.equal(result.items[0].nextOffset, 1);
});

test('result continuation beyond the response byte ceiling retains the exact cursor', async () => {
	const offset = 3 * 1024 * 1024 + 17;
	const item = { toolCallId: id, sha256: hash, offset, maxBytes: 4096 };
	const input = decodeInput('tool_result_read', JSON.stringify({ items: [item] }));
	assert.deepEqual(input.items, [item]);
	let calls = 0;
	const result = await invoke('tool_result_read', { items: [item] }, async (request) => {
		calls++;
		assert.equal(request.operation, 'context.readResults');
		assert.deepEqual(request.item, item);
		return {
			toolCallId: id,
			sha256: hash,
			originalBytes: offset + 64,
			offset,
			nextOffset: offset + 3,
			text: '末尾🙂',
		};
	});
	assert.equal(calls, 1, 'Continuation reads the capture, never reexecutes its source');
	assert.equal(result.items[0].offset, offset);
	assert.equal(result.items[0].nextOffset, offset + 3);
	for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => decodeInput('tool_result_read', JSON.stringify({ items: [{ ...item, offset: invalid }] })));
	}
});

test('aggregation never converts Host failure or cancellation into successful partial output', async () => {
	const failure = new Error('HOST_AUTHORIZATION_REVOKED');
	await assert.rejects(
		presentArtifacts(
			[id],
			async () => {
				throw failure;
			},
			signal,
		),
		(error) => error === failure,
	);
	const controller = new AbortController();
	controller.abort();
	let calls = 0;
	await assert.rejects(
		readToolResults(
			[{ toolCallId: id, sha256: hash, offset: 0, maxBytes: 8 }],
			async () => {
				calls += 1;
			},
			controller.signal,
		),
	);
	assert.equal(calls, 0);
});

test('collaboration converts model decimal targets and removes model action discriminator', async () => {
	let command;
	await invoke(
		'collaboration_delegate',
		{ profile: 'explore', objective: 'Inspect', targets: ['12'], dependencyMode: 'success' },
		async (request) => {
			command = request;
			return { childId: id };
		},
	);
	assert.deepEqual(command, {
		operation: 'collaboration.delegate',
		profile: 'explore',
		objective: 'Inspect',
		inputJson: '{"model":{"providerId":"fixture"}}',
		targets: [12],
		dependencies: [],
		dependencyMode: 'success',
	});
	assert.throws(() =>
		decodeInput(
			'collaboration_delegate',
			JSON.stringify({ profile: 'explore', objective: 'Inspect', targets: ['01'], dependencyMode: 'success' }),
		),
	);
});

test('model defaults and memory proposal settings are package owned', async () => {
	let request;
	await invoke('memory_propose', { content: 'Candidate' }, async (value) => {
		request = value;
		return { id, version: 1, status: 'candidate' };
	});
	assert.deepEqual(request, { operation: 'memory.propose', content: 'Candidate', confidence: 0.5, expiresAt: null });
	await invoke('artifact_read', { artifactId: id }, async (value) => {
		request = value;
		return { id, sha256: hash, sizeBytes: 0, offset: 0, nextOffset: null, base64: '', text: null };
	});
	assert.deepEqual(request, {
		operation: 'artifacts.read',
		artifactId: id,
		offset: 0,
		maxBytes: 4096,
		encoding: 'base64',
	});
	assert.throws(() =>
		decodeInput('artifact_read', JSON.stringify({ artifactId: id, encoding: 'utf8', maxBytes: 1 })),
	);
	assert.throws(() => decodeInput('tool_search', JSON.stringify({ query: 'files', appId: id })));
});

test('every model entry dispatches only its finite canonical Host operation', async () => {
	const cases = [
		[
			'skill_search',
			{ query: '  review ' },
			{ operation: 'skills.catalog', offset: 0 },
			{ items: [], nextOffset: null, catalogSha256: hash },
		],
		[
			'skill_read',
			{ name: 'review', version: '2.0.0', sha256: hash },
			{ operation: 'skills.read', name: 'review', version: '2.0.0', sha256: hash },
			{ content: 'Untrusted skill' },
		],
		['image_models_list', {}, { operation: 'images.list' }, { models: [] }],
		[
			'image_generate',
			{ providerId: id, configurationVersion: 3, modelId: 'image', prompt: 'A diagram' },
			{
				operation: 'images.generate',
				providerId: id,
				configurationVersion: 3,
				modelId: 'image',
				prompt: 'A diagram',
			},
			{ id, name: 'diagram.png', sizeBytes: 17 },
		],
		[
			'memory_recall',
			{ query: 'design' },
			[
				{ operation: 'memory.retrieve', action: 'candidates', limit: 10, offset: 0 },
				{ operation: 'memory.retrieve', action: 'select', limit: 10, candidatesSha256: hash, items: [] },
			],
			[
				{
					action: 'candidates',
					items: [],
					nextOffset: null,
					candidatesSha256: hash,
					maxItems: 10,
					maxBytes: 4096,
				},
				{ action: 'select', items: [] },
			],
		],
		['collaboration_list', {}, { operation: 'collaboration.list', after: null, limit: 16 }, { items: [] }],
		[
			'collaboration_output_read',
			{ childId: id, offset: 3, maxBytes: 99 },
			{ operation: 'collaboration.readOutput', childId: id, offset: 3, maxBytes: 99 },
			{ text: 'page' },
		],
		[
			'collaboration_join',
			{ childIds: [id], mode: 'any', waitSeconds: 1 },
			{ operation: 'collaboration.join', childIds: [id], mode: 'any', waitSeconds: 1 },
			{ settled: [] },
		],
		[
			'collaboration_cancel',
			{ childIds: [id] },
			{ operation: 'collaboration.cancel', childIds: [id] },
			{ cancelled: [] },
		],
		[
			'collaboration_message_send',
			{ recipientId: id, body: 'message', ttlSeconds: 60 },
			{ operation: 'collaboration.sendMessage', recipientId: id, body: 'message', ttlSeconds: 60 },
			{ accepted: true },
		],
		[
			'collaboration_message_read',
			{ after: 0, limit: 4 },
			{ operation: 'collaboration.readMessages', after: 0, limit: 4 },
			{ items: [] },
		],
		[
			'collaboration_message_consume',
			{ through: 2, expectedConsumed: 0 },
			{ operation: 'collaboration.consumeMessages', through: 2, expectedConsumed: 0 },
			{ consumed: 2 },
		],
		[
			'collaboration_fact_read',
			{ key: 'finding' },
			{ operation: 'collaboration.readFact', key: 'finding' },
			{ value: null },
		],
		[
			'collaboration_fact_write',
			{ key: 'finding', value: 'Untrusted fact', expectedVersion: 0 },
			{ operation: 'collaboration.writeFact', key: 'finding', value: 'Untrusted fact', expectedVersion: 0 },
			{ version: 1 },
		],
	];
	for (const [name, args, expected, value] of cases) {
		let calls = 0;
		const expectedRequests = Array.isArray(expected) ? expected : [expected];
		const replies = Array.isArray(value) ? value : [value];
		await invoke(name, args, async (request) => {
			assert.deepEqual(request, expectedRequests[calls], name);
			return replies[calls++];
		});
		assert.equal(calls, expectedRequests.length, name);
	}
});

const catalogDefinitions = [
	{
		name: 'bound_file_read',
		semanticName: 'file_read',
		description: 'Read remote files. Second sentence.',
		parameters: ['paths'],
		keywords: ['file 文件'],
		loader: false,
	},
	{
		name: 'bound_docker_inspect',
		semanticName: 'machine_docker_inspect',
		description: 'Inspect Docker containers.',
		parameters: ['containerIds'],
		keywords: ['docker 容器'],
		loader: false,
	},
	{
		name: 'bound_mcp_tool',
		semanticName: 'mcp_tool',
		description: 'Invoke an MCP integration.',
		parameters: ['integrationId'],
		keywords: ['MCP'],
		loader: false,
	},
	{
		name: 'bound_acp_execute',
		semanticName: 'acp_execute',
		description: 'Execute ACP agent.',
		parameters: ['prompt'],
		keywords: ['ACP'],
		loader: false,
	},
	{
		name: 'bound_loader',
		semanticName: 'tool_search',
		description: 'Find tools.',
		parameters: ['query'],
		keywords: ['tools'],
		loader: true,
	},
];

test('package discovery preserves wildcard, semantic exact names, multilingual matching and no fuzzy overloading', () => {
	assert.deepEqual(searchDefinitions(catalogDefinitions, '*'), catalogDefinitions.slice(0, 4));
	assert.deepEqual(
		searchDefinitions(catalogDefinitions, 'file_read，machine_docker_inspect').map((tool) => tool.name),
		['bound_file_read', 'bound_docker_inspect'],
	);
	assert.deepEqual(
		searchDefinitions(catalogDefinitions, 'docker 容器').map((tool) => tool.name),
		['bound_docker_inspect'],
	);
	assert.deepEqual(
		searchDefinitions(catalogDefinitions, 'MCP').map((tool) => tool.name),
		['bound_mcp_tool'],
	);
	assert.deepEqual(searchDefinitions(catalogDefinitions, '?!'), []);
	assert.deepEqual(searchDefinitions(catalogDefinitions, 'tool_search'), []);
});

function directoryEntries() {
	return catalogDefinitions.map((tool) => ({
		key: 'nexus.tools.fixture.' + tool.semanticName,
		summary: tool.description.split('. ')[0] + '.',
		tags: [...tool.keywords, ...(tool.loader ? ['loader'] : [])],
	}));
}

test('discovery returns exact selected registry keys for the next App turn without a Host activation effect', async () => {
	const requests = [];
	const context = {
		directory: {
			async discover(query) {
				requests.push(query);
				return { entries: directoryEntries(), nextCursor: null };
			},
		},
	};
	const result = await perform(
		'tool_search',
		decodeInput('tool_search', JSON.stringify({ query: ' file_read ' })),
		async () => assert.fail('Discovery must not mutate Host authority'),
		signal,
		null,
		context,
	);
	assert.deepEqual(requests, [{ contract: null, apiVersion: null, kind: 'tool', cursor: null }]);
	assert.deepEqual(result, {
		matches: [{ key: 'nexus.tools.fixture.file_read', summary: 'Read remote files.' }],
		loadKeys: ['nexus.tools.fixture.file_read'],
		availableNextTurn: true,
	});
});

test('checkpoint is an App directive and never invokes a Host chat policy', async () => {
	const result = await invoke('context_checkpoint', { summary: 'Previous work' }, async () =>
		assert.fail('No Host checkpoint policy'),
	);
	assert.deepEqual(result, { appDirective: { kind: 'contextCheckpoint', summary: 'Previous work' } });
});

test('Skill search ranks across coherent catalog pages and preserves exact readable identities', async () => {
	const skills = [
		{ name: 'z-review', description: 'Review design', version: '2.0.0', sha256: hash },
		{ name: 'unrelated', description: 'Deployment', version: '2.0.0', sha256: hash },
		{ name: 'a-review', description: 'Review design', version: '2.0.1', sha256: 'b'.repeat(64) },
		{ name: 'review', description: 'Code only', version: '2.0.0', sha256: hash },
	];
	const requests = [];
	const result = await invoke('skill_search', { query: 'review design' }, async (request) => {
		requests.push(request);
		return {
			items: skills.slice(request.offset, request.offset + 2),
			nextOffset: request.offset === 0 ? 2 : null,
			catalogSha256: hash,
		};
	});
	assert.deepEqual(requests, [
		{ operation: 'skills.catalog', offset: 0 },
		{ operation: 'skills.catalog', offset: 2 },
	]);
	assert.deepEqual(result.matches, [skills[2], skills[0], skills[3]]);
	let calls = 0;
	await assert.rejects(
		invoke('skill_search', { query: 'review' }, async () => ({
			items: [skills[0]],
			nextOffset: calls++ === 0 ? 1 : null,
			catalogSha256: calls === 1 ? hash : 'b'.repeat(64),
		})),
		/HOST_CANDIDATE_SNAPSHOT_CHANGED/,
	);
	assert.equal(calls, 2);
});

test('memory recall ranks authorized pages and revalidates exact selections through Host', async () => {
	const memories = [
		{ id, version: 1, content: 'design notes', confidence: 0.2 },
		{ id: '22222222-2222-4222-8222-222222222222', version: 2, content: 'design review', confidence: 0.9 },
		{ id: '33333333-3333-4333-8333-333333333333', version: 3, content: 'unrelated', confidence: 1 },
	];
	const requests = [];
	const result = await invoke('memory_recall', { query: 'design review', limit: 2 }, async (request) => {
		requests.push(request);
		if (request.action === 'select') {
			assert.deepEqual(request.items, [
				{ id: memories[1].id, version: 2, score: 2 },
				{ id, version: 1, score: 1 },
			]);
			return {
				action: 'select',
				items: request.items.map((selected) => ({
					...memories.find((item) => item.id === selected.id),
					score: selected.score,
				})),
			};
		}
		return {
			action: 'candidates',
			items: memories.slice(request.offset, request.offset + 2),
			nextOffset: request.offset === 0 ? 2 : null,
			candidatesSha256: hash,
			maxItems: 2,
			maxBytes: 4096,
		};
	});
	assert.deepEqual(requests.slice(0, 2), [
		{ operation: 'memory.retrieve', action: 'candidates', limit: 2, offset: 0 },
		{ operation: 'memory.retrieve', action: 'candidates', limit: 2, offset: 2 },
	]);
	assert.equal(requests[2].candidatesSha256, hash);
	assert.deepEqual(
		result.items.map((item) => item.id),
		[memories[1].id, id],
	);
	let calls = 0;
	await assert.rejects(
		invoke('memory_recall', { query: 'design' }, async (request) => {
			calls++;
			assert.equal(request.action, 'candidates');
			if (calls === 2) {
				throw new Error('forbidden');
			}
			return {
				action: 'candidates',
				items: [memories[0]],
				nextOffset: 1,
				candidatesSha256: hash,
				maxItems: 10,
				maxBytes: 4096,
			};
		}),
		/forbidden/,
	);
	assert.equal(calls, 2);
});

test('discovery reads all coherent pages and propagates supersession without returning stale keys', async () => {
	const entries = directoryEntries();
	const requests = [];
	const context = {
		directory: {
			async discover(query) {
				requests.push(query);
				return {
					entries: query.cursor === null ? entries.slice(0, 3) : entries.slice(3),
					nextCursor: query.cursor === null ? 'next' : null,
				};
			},
		},
	};
	const result = await perform(
		'tool_search',
		decodeInput('tool_search', JSON.stringify({ query: '*' })),
		async () => assert.fail(),
		signal,
		null,
		context,
	);
	assert.deepEqual(
		requests.map((query) => query.cursor),
		[null, 'next'],
	);
	assert.deepEqual(
		result.loadKeys,
		entries.slice(0, 4).map((entry) => entry.key),
	);
	let calls = 0;
	context.directory.discover = async () => {
		calls++;
		if (calls === 2) {
			const error = new Error('superseded');
			error.code = 'version_conflict';
			throw error;
		}
		return { entries: entries.slice(0, 1), nextCursor: 'next' };
	};
	await assert.rejects(
		perform(
			'tool_search',
			decodeInput('tool_search', JSON.stringify({ query: '*' })),
			async () => assert.fail(),
			signal,
			null,
			context,
		),
		{ code: 'version_conflict' },
	);
	assert.equal(calls, 2);
});

await test('Skill and Memory searches use every query term rather than a 32-term prefix', async () => {
	const terms = Array.from({ length: 80 }, (_, index) => 'term' + index);
	const query = terms.join(' ');
	const skill = await invoke('skill_search', { query, limit: 8 }, async () => ({
		items: [{ name: 'last-term', description: 'term79', version: '4.0.0', sha256: hash }],
		nextOffset: null,
		catalogSha256: hash,
	}));
	assert.equal(skill.matches[0].name, 'last-term');
	let selected;
	const memory = await invoke('memory_recall', { query, limit: 1 }, async (request) => {
		if (request.action === 'candidates') {
			return {
				action: 'candidates',
				items: [{ id, version: 1, content: query, confidence: 1 }],
				nextOffset: null,
				candidatesSha256: hash,
				maxItems: 1,
				maxBytes: 65536,
			};
		}
		selected = request.items[0];
		return { action: 'select', items: [{ ...selected, content: query, confidence: 1 }], candidatesSha256: hash };
	});
	assert.equal(selected.score, 80);
	assert.equal(memory.items[0].score, 80);
	assert.equal(
		decodeInput('memory_recall', JSON.stringify({ query: 'term '.repeat(2000), limit: 1 })).query.length,
		10000,
	);
});

await test('Skill searches accept explicit result counts above eight and tool text consumes full request capacity', async () => {
	const items = Array.from({ length: 20 }, (_, index) => ({
		name: 'review-' + index,
		description: 'Review design',
		version: '4.0.0',
		sha256: hash,
	}));
	const result = await invoke('skill_search', { query: 'review', limit: 20 }, async () => ({
		items,
		nextOffset: null,
		catalogSha256: hash,
	}));
	assert.equal(result.matches.length, 20);
	const content = 'body '.repeat(15000);
	assert.equal(decodeInput('memory_propose', JSON.stringify({ content })).content, content);
	assert.equal(decodeInput('context_checkpoint', JSON.stringify({ summary: content })).summary, content);
	assert.equal(
		decodeInput(
			'image_generate',
			JSON.stringify({ providerId: id, configurationVersion: 1, modelId: 'fixture', prompt: content }),
		).input.prompt,
		content,
	);
});

await test('Collaboration message arguments preserve escaped Unicode bodies above 32 KiB', async () => {
	const body = '"\\\n😀'.repeat(18000);
	const result = await invoke(
		'collaboration_message_send',
		{ recipientId: id, body, ttlSeconds: 300 },
		async (request) => {
			assert.equal(request.operation, 'collaboration.sendMessage');
			assert.equal(request.body, body);
			return { sent: true };
		},
	);
	assert.deepEqual(result, { sent: true });
});
