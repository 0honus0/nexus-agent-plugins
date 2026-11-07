import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definitions } from '../src/definitions.mjs';
import { decodeInput } from '../src/input.mjs';
import { executeIntegrations } from '../src/operations.mjs';

const instanceId = '11111111-1111-4111-8111-111111111111';
const schemaHash = 'a'.repeat(64);
const signal = new AbortController().signal;

function invoke(name, args, serviceCall, context = {}, callSignal = signal) {
	return executeIntegrations(
		name,
		decodeInput(name, JSON.stringify(args)),
		async () => assert.fail('Protocol algorithms belong to service plugins'),
		callSignal,
		serviceCall,
		context,
	);
}

test('all integration adapters register as managed capabilities with provider-owned schemas', () => {
	assert.deepEqual(
		definitions.map((tool) => tool.key.split('.').at(-1)),
		['mcp_discover', 'mcp_tool', 'mcp_resource', 'mcp_prompt', 'acp_integration_list', 'acp_execute'],
	);
	for (const definition of definitions) {
		assert.equal(definition.execution, 'managed');
		assert.equal(definition.contract, 'nexus.model-tool');
		assert.equal(JSON.parse(definition.inputSchemaJson).additionalProperties, false);
		assert.equal(Object.hasOwn(definition, 'hostOperations'), false);
	}
});

test('MCP discover and ACP lists page current service instances without manufacturing connection settings', async () => {
	for (const [name, contract] of [
		['mcp_discover', 'nexus.protocol.mcp.discover'],
		['acp_integration_list', 'nexus.protocol.acp.execute'],
	]) {
		const calls = [];
		const context = {
			directory: {
				async discover(query) {
					calls.push(query);
					return {
						entries: [
							{
								instanceId: query.cursor === null ? instanceId : 'second',
								summary: 'Untrusted remote name',
								package: { packageId: 'thirdparty.service', version: '1.0.0' },
								privateHandle: 'hidden',
							},
						],
						nextCursor: query.cursor === null ? 'next' : null,
					};
				},
			},
		};
		const result = await invoke(name, {}, async () => assert.fail(), context);
		assert.deepEqual(calls, [
			{ contract, apiVersion: 1, kind: 'service', cursor: null },
			{ contract, apiVersion: 1, kind: 'service', cursor: 'next' },
		]);
		assert.equal(result.untrusted, true);
		assert.equal(result.instances.length, 2);
		assert.equal(JSON.stringify(result).includes('privateHandle'), false);
	}
});

test('MCP tool/resource/prompt retain exact instance, catalog, argument and continuation identities', async () => {
	for (const [name, kind] of [
		['mcp_tool', 'tool'],
		['mcp_resource', 'resource'],
		['mcp_prompt', 'prompt'],
	]) {
		for (const requestState of [null, 'opaque-request-state']) {
			const args = {
				instanceId,
				schemaHash,
				name: 'remote-name',
				argumentsJson: '{"value":"untrusted"}',
				continuation: 'exact-continuation',
				resume: { requestState, inputResponsesJson: '{"response-1":"answer"}' },
			};
			const requests = [];
			const response = { kind: 'completed', resultJson: '{"result":"untrusted"}', continuation: null };
			const result = await invoke(name, args, async (input) => {
				requests.push(input);
				return response;
			});
			assert.deepEqual(requests, [
				{
					contract: 'nexus.protocol.mcp.invoke',
					instanceId,
					argumentsJson: JSON.stringify({
						kind,
						name: args.name,
						argumentsJson: args.argumentsJson,
						schemaHash,
						continuation: args.continuation,
						resume: args.resume,
					}),
				},
			]);
			assert.deepEqual(result, response);
		}
	}
});

test('initial MCP requests do not invent continuation state; ACP argv and targets remain in trusted settings', async () => {
	const requests = [];

	const service = async (input) => {
		requests.push(input);
		return { text: 'done' };
	};

	await invoke(
		'mcp_tool',
		{ instanceId, schemaHash, name: 'tool', argumentsJson: '{}', continuation: null, resume: null },
		service,
	);
	await invoke('mcp_discover', { instanceId }, service);
	await invoke('acp_execute', { instanceId, prompt: 'Task' }, service);
	assert.deepEqual(JSON.parse(requests[0].argumentsJson).resume, null);
	assert.deepEqual(requests[1], {
		contract: 'nexus.protocol.mcp.discover',
		instanceId,
		argumentsJson: '{"refresh":true}',
	});
	assert.deepEqual(requests[2], {
		contract: 'nexus.protocol.acp.execute',
		instanceId,
		argumentsJson: '{"prompt":"Task"}',
	});
});

test('unknown service effects and cancellation are propagated without another invocation', async () => {
	for (const name of ['mcp_tool', 'acp_execute']) {
		let calls = 0;
		const args =
			name === 'acp_execute'
				? { instanceId, prompt: 'Task' }
				: { instanceId, schemaHash, name: 'tool', argumentsJson: '{}', continuation: null, resume: null };
		const failure = Object.assign(new Error('Unknown'), { code: 'operation_unknown' });
		await assert.rejects(
			invoke(name, args, async () => {
				calls++;
				throw failure;
			}),
			(error) => error === failure,
		);
		assert.equal(calls, 1);
		const aborted = new AbortController();
		aborted.abort();
		await assert.rejects(
			invoke(
				name,
				args,
				async () => {
					calls++;
				},
				{},
				aborted.signal,
			),
		);
		assert.equal(calls, 1);
	}
});
