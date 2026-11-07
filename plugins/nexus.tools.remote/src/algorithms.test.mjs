import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodeInput } from './input.mjs';
import { executeRemote } from './execute.mjs';
import { inspectPaths, mutateBatch } from './batches.mjs';
import { projectGuidance } from './project-guidance.mjs';
import { readAgentPluginRpcInput } from '@nexus-terminal/shared/agent/plugins/rpc-codec';

const signal = new AbortController().signal;
const fingerprint = 'f'.repeat(64);

test('remote model arguments retain defaults, absolute paths and whole-plan alias rejection', () => {
	assert.deepEqual(decodeInput('shell_execute', JSON.stringify({ connectionId: 2, commands: ['pwd'] })), {
		kind: 'shell',
		connectionId: 2,
		commands: ['pwd'],
		onError: 'stop',
		cwd: null,
		mode: 'foreground',
		yieldSeconds: null,
	});
	assert.equal(
		decodeInput('file_search', JSON.stringify({ connectionId: 2, path: '/tmp//project', queries: ['one'] })).path,
		'/tmp/project',
	);
	assert.throws(
		() =>
			decodeInput(
				'file_move',
				JSON.stringify({
					connectionId: 2,
					items: [
						{ path: '/tmp/a', destinationPath: '/tmp/b', expectedFingerprint: fingerprint },
						{ path: '/tmp/b/nested', destinationPath: '/tmp/c', expectedFingerprint: fingerprint },
					],
				}),
			),
		(error) => error.code === 'invalid_input',
	);
	assert.throws(
		() => decodeInput('shell_execute', JSON.stringify({ connectionId: 2, commands: ['pwd'], userId: 1 })),
		(error) => error.code === 'invalid_input',
	);
	assert.throws(
		() =>
			decodeInput(
				'file_patch',
				JSON.stringify({
					connectionId: 2,
					path: '/',
					expectedSha256: fingerprint,
					edits: [{ oldText: 'a', newText: 'b' }],
				}),
			),
		(error) => error.code === 'invalid_input',
	);
});

test('readonly inspection preserves per-path refusal and continues ordered items', async () => {
	const requests = [];
	const result = await inspectPaths(
		{ connectionId: 2, paths: ['/missing', '/found'] },
		async (request) => {
			requests.push(request);
			if (request.path === '/missing') {
				return { status: 'not_found' };
			}
			return {
				status: 'ok',
				value: {
					path: request.path,
					kind: 'file',
					fingerprint,
					fileCount: 1,
					directoryCount: 0,
					bytes: 4,
					secret: 'strip',
				},
			};
		},
		signal,
	);
	assert.deepEqual(
		requests.map((request) => request.operation),
		['remote.inspect', 'remote.inspect'],
	);
	assert.deepEqual(result.items[0], { index: 0, path: '/missing', failureCode: 'not_found' });
	assert.equal(result.items[1].value.bytes, 4);
	assert.equal('secret' in result.items[1].value, false);
	assert.equal(result.nextIndex, null);
});

test('mutations submit one governed complete plan and project completed/failed/not_started explicitly', async () => {
	const calls = [];
	const input = {
		kind: 'write',
		connectionId: 2,
		onError: 'stop',
		items: [
			{ path: '/a', content: 'a', expectedSha256: 'absent' },
			{ path: '/b', content: 'b', expectedSha256: 'absent' },
			{ path: '/c', content: 'c', expectedSha256: 'absent' },
		],
	};
	const result = await mutateBatch(
		input,
		async (request) => {
			calls.push(request);
			return {
				items: [
					{
						index: 0,
						status: 'completed',
						value: { path: '/a', status: 'created', bytes: 1, sha256: fingerprint, userId: 42 },
					},
					{ index: 1, status: 'failed', failureCode: 'conflict' },
					{ index: 2, status: 'not_started' },
				],
			};
		},
		signal,
	);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], { operation: 'remote.write', connectionId: 2, items: input.items, onError: 'stop' });
	assert.deepEqual(
		result.items.map((item) => item.status),
		['completed', 'failed', 'not_started'],
	);
	assert.equal('userId' in result.items[0].value, false);
});

test('binding is written only after scoped AGENTS pages are read successfully', async () => {
	const requests = [];
	const result = await projectGuidance(
		{ kind: 'project', connectionId: 2, input: { action: 'bind', directory: '/project' } },
		async (request) => {
			requests.push(request);
			if (request.operation === 'remote.listPage') {
				return {
					status: 'ok',
					value: { entries: [{ name: 'AGENTS.md', kind: 'file', size: 4 }], nextAfter: null },
				};
			}
			if (request.operation === 'remote.readTextPage') {
				return {
					status: 'ok',
					value: {
						path: '/project/AGENTS.md',
						text: 'rule',
						bytes: 4,
						sizeBytes: 4,
						offset: 0,
						fingerprint,
						pageSha256: createHash('sha256').update('rule').digest('hex'),
						sha256: createHash('sha256').update('rule').digest('hex'),
						nextOffset: null,
					},
				};
			}
			return { binding: { directory: '/project' } };
		},
		signal,
	);
	assert.deepEqual(
		requests.map((request) => request.operation),
		['remote.listPage', 'remote.readTextPage', 'project.bindingWrite'],
	);
	assert.deepEqual(result.binding, { connectionId: 2, directory: '/project' });
	assert.equal(result.instructions[0].scopePath, '/project');
});

test('project guidance follows every page, deep scope and large instructions before binding', async () => {
	const content = 'instruction '.repeat(7000);
	const hash = createHash('sha256').update(content).digest('hex');
	const readPaths = new Set();
	let bound = false;

	const call = async (request) => {
		if (request.operation === 'project.bindingRead') {
			return { binding: { directory: '/project' } };
		}
		if (request.operation === 'remote.listPage') {
			return {
				status: 'ok',
				value: {
					entries:
						request.after === ''
							? [{ name: 'AGENTS.md', kind: 'file', size: Buffer.byteLength(content) }]
							: [],
					nextAfter: request.after === '' ? 'AGENTS.md' : null,
				},
			};
		}
		if (request.operation === 'remote.readTextPage') {
			readPaths.add(request.path);
			const text = content.slice(request.offset, request.offset + request.maxBytes);
			const end = request.offset + Buffer.byteLength(text);
			return {
				status: 'ok',
				value: {
					path: request.path,
					text,
					bytes: Buffer.byteLength(text),
					sizeBytes: Buffer.byteLength(content),
					offset: request.offset,
					fingerprint,
					pageSha256: createHash('sha256').update(text).digest('hex'),
					nextOffset: end === Buffer.byteLength(content) ? null : end,
				},
			};
		}
		if (request.operation === 'project.bindingWrite') {
			bound = true;
			return {};
		}
		assert.fail(request.operation);
	};

	const result = await projectGuidance(
		{
			kind: 'project',
			connectionId: 2,
			input: { action: 'read', path: '/project/' + Array.from({ length: 12 }, (_, i) => 'd' + i).join('/') },
		},
		call,
		signal,
	);
	assert.equal(readPaths.size, 13);
	assert.equal(result.instructions.length, 13);
	for (const instruction of result.instructions) {
		assert.equal(instruction.text, content);
		assert.equal(instruction.sha256, hash);
	}
	const binding = await projectGuidance(
		{ kind: 'project', connectionId: 2, input: { action: 'bind', directory: '/project' } },
		call,
		signal,
	);
	assert.equal(binding.instructions[0].text, content);
	assert.equal(bound, true);
	bound = false;
	await assert.rejects(
		projectGuidance(
			{ kind: 'project', connectionId: 2, input: { action: 'bind', directory: '/project' } },
			async (request) => {
				const response = await call(request);
				if (request.operation === 'remote.readTextPage' && request.offset > 0) {
					response.value.fingerprint = 'a'.repeat(64);
				}
				return response;
			},
			signal,
		),
		(error) => error.code === 'version_conflict',
	);
	assert.equal(bound, false, 'changed instruction cannot commit a binding');
});

test('project read rejects paths outside its binding before reading a remote page', async () => {
	const requests = [];
	await assert.rejects(
		projectGuidance(
			{ kind: 'project', connectionId: 2, input: { action: 'read', path: '/other' } },
			async (request) => {
				readAgentPluginRpcInput({ method: 'host.perform', params: request });
				requests.push(request.operation);
				return { binding: { directory: '/project' } };
			},
			signal,
		),
		(error) => error.code === 'invalid_input',
	);
	assert.deepEqual(requests, ['project.bindingRead']);
});

test('file search maps several literals to one domain traversal and strips internal fields', async () => {
	const requests = [];
	const input = decodeInput(
		'file_search',
		JSON.stringify({ connectionId: 2, path: '/project', queries: ['first', 'second'] }),
	);
	const result = await executeRemote(
		'file_search',
		input,
		async (request) => {
			requests.push(request);
			return {
				matches: [
					{ queryIndex: 1, path: '/project/file', line: 2, column: 3, text: 'second', internal: 'strip' },
				],
				truncated: false,
			};
		},
		signal,
	);
	assert.deepEqual(requests, [
		{ operation: 'remote.search', connectionId: 2, path: '/project', queries: ['first', 'second'], maxResults: 20 },
	]);
	assert.deepEqual(result, {
		matches: [{ queryIndex: 1, path: '/project/file', line: 2, column: 3, text: 'second' }],
		truncated: false,
	});
});

test('all seventeen newly migrated remote model entries reach only declared domain operations', async () => {
	const cases = [
		['host_diagnostics_read', {}, ['diagnostics.host']],
		['file_deliver', { connectionId: 2, paths: ['/a'] }, ['remote.deliver']],
		[
			'project_directory_bind',
			{ connectionId: 2, directory: '/project' },
			['remote.listPage', 'project.bindingWrite'],
		],
		['project_directory_read', { connectionId: 2 }, ['project.bindingRead']],
		['project_directory_clear', { connectionId: 2 }, ['project.bindingWrite']],
		['shell_execute', { connectionId: 2, commands: ['pwd'] }, ['shell.execute']],
		['shell_job_control', { connectionId: 2, action: 'list' }, ['shell.jobs']],
		['machine_docker_inspect', { connectionId: 2, containerIds: [fingerprint] }, ['docker.inspect']],
		[
			'machine_docker_control',
			{
				connectionId: 2,
				items: [{ containerId: fingerprint, expectedFingerprint: fingerprint, action: 'start' }],
			},
			['docker.control'],
		],
		['file_inspect', { connectionId: 2, paths: ['/a'] }, ['remote.inspect']],
		[
			'file_patch',
			{ connectionId: 2, path: '/a', expectedSha256: fingerprint, edits: [{ oldText: 'a', newText: 'b' }] },
			['remote.patch'],
		],
		[
			'file_move',
			{ connectionId: 2, items: [{ path: '/a', destinationPath: '/b', expectedFingerprint: fingerprint }] },
			['remote.move'],
		],
		[
			'file_delete',
			{ connectionId: 2, items: [{ path: '/a', expectedFingerprint: fingerprint, scope: 'entry' }] },
			['remote.delete'],
		],
		[
			'file_write',
			{ connectionId: 2, items: [{ path: '/a', content: 'text', expectedSha256: 'absent' }] },
			['remote.write'],
		],
		['machine_connection_list', {}, ['targets.list']],
		['machine_diagnostics_read', { connectionId: 2 }, ['diagnostics.readTarget']],
		['file_search', { connectionId: 2, path: '/project', queries: ['find'] }, ['remote.search']],
	];
	const replies = {
		'diagnostics.host': {
			collectedAt: 0,
			process: {},
			modules: [],
			database: { available: true, schemaVersion: 1 },
		},
		'remote.deliver': { items: [] },
		'remote.write': { items: [] },
		'remote.move': { items: [] },
		'remote.delete': { items: [] },
		'docker.control': { items: [] },
		'project.bindingRead': { binding: null },
		'project.bindingWrite': { binding: null },
		'remote.listPage': { status: 'ok', value: { entries: [], nextAfter: null } },
		'shell.execute': { jobId: '00000000-0000-4000-8000-000000000001', accepted: true },
		'shell.jobs': { jobs: [], nextOffset: null },
		'docker.inspect': { status: 'not_found' },
		'remote.inspect': { status: 'not_found' },
		'remote.patch': { path: '/a', status: 'replaced', bytes: 1, sha256: fingerprint },
		'targets.list': { connections: [] },
		'diagnostics.readTarget': { loadAverage: [] },
		'remote.search': { matches: [], truncated: false },
	};
	for (const [name, args, expected] of cases) {
		const requests = [];
		await executeRemote(
			name,
			decodeInput(name, JSON.stringify(args)),
			async (request) => {
				readAgentPluginRpcInput({ method: 'host.perform', params: request });
				requests.push(request.operation);
				assert.ok(Object.hasOwn(replies, request.operation), request.operation);
				return replies[request.operation];
			},
			signal,
		);
		assert.deepEqual(requests, expected, name);
	}
});

test('foreground shell evidence is projected from the canonical owned Job snapshot', async () => {
	const jobId = '00000000-0000-4000-8000-000000000001';
	const value = await executeRemote(
		'shell_execute',
		decodeInput('shell_execute', JSON.stringify({ connectionId: 2, commands: ['pwd'] })),
		async () => ({
			jobId,
			state: 'completed',
			revision: 2,
			waitingForSpace: false,
			result: {
				status: 'completed',
				commands: [
					{
						index: 0,
						status: 'completed',
						exitCode: 0,
						signal: null,
						stdout: '/project',
						stderr: '',
						truncated: false,
					},
				],
			},
			createdAt: 1,
			updatedAt: 2,
		}),
		signal,
	);
	assert.deepEqual(value, {
		jobId,
		outputRead: { connectionId: 2, action: 'output', jobIds: [jobId], offset: 0 },
		status: 'completed',
		commands: [
			{
				index: 0,
				status: 'completed',
				exitCode: 0,
				signal: null,
				stdout: '/project',
				stderr: '',
				truncated: false,
			},
		],
	});
});

await test('Shell Job admission does not budget the retired inline command-result array', () => {
	const commands = Array.from({ length: 4000 }, () => 'true');
	const input = decodeInput('shell_execute', JSON.stringify({ connectionId: 1, commands }));
	assert.equal(input.commands.length, 4000);
	assert.equal(input.commands[3999], 'true');
});
