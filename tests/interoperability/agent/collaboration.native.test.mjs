import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCandidateHost } from '../support/candidate-host.mjs';
import { openScenarioHost } from '../support/scenario-host.mjs';

const candidate = await loadCandidateHost();
const until = candidate.waitForHost;
await writeFile(
	join(candidate.artifactRoot, 'collaboration-combination.json'),
	JSON.stringify(candidate.combination, null, 2),
);

function expectStatus(response, expected) {
	assert.equal(response.status, expected);
	return response.body;
}

function findFixtureTool(body, localName) {
	const matches = body.tools
		.map((tool) => tool.function ?? tool)
		.filter((tool) => /^nt_[a-f0-9]{12}_/u.test(tool.name) && tool.name.endsWith('_' + localName));
	assert.ok(matches.length <= 1, 'Ambiguous signed tool name');
	return matches[0];
}

function packageTool(body, packageId, localName) {
	assert.equal(packageId, 'nexus.tools.remote');
	const definition = findFixtureTool(body, localName);
	assert.ok(definition, 'Missing signed declaration: ' + packageId + '.' + localName);
	return definition;
}

await test('Agent Child inheritance, dynamic catalog and conflict consumption', { timeout: 180_000 }, async (t) => {
	let sequence = 0;

	async function scenario(name, work, options = {}) {
		await t.test(name, async (tc) => {
			const { host, directory } = await openScenarioHost(tc, candidate, 'collaboration-' + ++sequence, {
				discover:
					'collaboration_delegate collaboration_join collaboration_cancel collaboration_list collaboration_message_send collaboration_message_read collaboration_message_consume collaboration_fact_write collaboration_fact_read file_read file_write shell_execute',
				...options,
			});
			await host.grants(['app.intents.exchange', 'file.read', 'file.write']);
			await work(host, directory);
		});
	}

	const childPath = (f, run) => '/api/v1/agent/apps/' + f.appId + '/runs/' + run.id + '/subagents';

	async function children(f, run, count) {
		return until(
			async () => expectStatus(await f.api('GET', childPath(f, run)), 200).items,
			(items) => items.length === count,
			'Expected children',
		);
	}

	function delegate(objective, extra = {}) {
		return {
			name: 'collaboration_delegate',
			input: {
				profile: 'explore',
				objective,
				dependencyMode: 'success',
				...extra,
			},
		};
	}

	await scenario(
		'delegation inherits tools and budgets while preserving isolated history and safe observation',
		async (f) => {
			const objective = f.program('independent child', (results, body) => {
				assert.equal(results.length, 0);
				assert.equal(body.messages.filter((message) => message.role === 'user').length, 1);
				const names = body.tools.map((tool) => tool.function.name);
				assert.ok(names.includes(packageTool(body, 'nexus.tools.remote', 'file_read').name));
				assert.ok(names.includes(packageTool(body, 'nexus.tools.remote', 'file_write').name));
				assert.equal(findFixtureTool(body, 'collaboration_delegate'), undefined);
				return {};
			});
			const run = await f.start('private parent context', (results) => {
				if (!results.length) {
					return delegate(objective, { targets: [String(f.connectionId)] });
				}
				if (results.length === 1) {
					return {
						name: 'collaboration_join',
						input: { childIds: [results[0].id], mode: 'all', waitSeconds: 5 },
					};
				}
				assert.equal(results[1].ready, true);
				assert.equal(results[1].children[0].status, 'completed');
				assert.equal(results[1].children[0].output, 'Fixture finished');
				return {};
			});
			assert.equal((await children(f, run, 0)).length, 0);
			await f.approve(await f.approval(run, 'collaboration_delegate'));
			await f.wait(run, 'completed');
			const [child] = await children(f, run, 1);
			assert.equal(child.status, 'completed');
			assert.equal(child.parentId, run.id);
			assert.equal(child.deadlineAt, f.runPolicyEvidence(run).deadlineAt);
			const settings = expectStatus(await f.api('GET', '/api/v1/agent/execution-settings'), 200).settings;
			assert.equal(f.childPolicyEvidence(child).maxModelRequests, settings.limits.maxModelRequests);
			assert.deepEqual(Object.keys(child).sort(), [
				'deadlineAt',
				'id',
				'parentId',
				'profile',
				'status',
				'version',
			]);
			const call = f.calls.find((value) => value.key === objective);
			assert.ok(call);
			assert.ok(!JSON.stringify(call.body).includes('private parent context'));
			assert.equal(f.calls.length, 6);
			await f.restart();
			assert.equal((await children(f, run, 1))[0].status, 'completed');
			assert.equal(f.calls.length, 6);
		},
	);
	await scenario(
		'Child inherits the authorized dynamic package catalog, discovers an unloaded package tool and persists real bounded readonly descendants',
		async (f, directory) => {
			await f.grants(['context.read', 'file.read', 'app.intents.exchange']);
			const project = join(directory, 'dynamic-project');
			await mkdir(project);
			await writeFile(
				join(project, 'package.json'),
				JSON.stringify({ name: 'dynamic-child-project', scripts: { test: 'node --check index.mjs' } }),
			);
			await writeFile(join(project, 'index.mjs'), 'export const actual = true;\n');
			let inspectedName;
			const restrictedNames = new Set();
			const hidden = ['remote.readTextPage', 'remote.listPage'];
			const objective = f.program('dynamic signed package Child', (results, body) => {
				const offered = body.tools.map((tool) => tool.function.name);
				assert.ok(hidden.every((name) => !offered.includes(name)));
				assert.equal(findFixtureTool(body, 'collaboration_delegate'), undefined);
				assert.equal(findFixtureTool(body, 'file_write'), undefined, 'ungranted writes remain unavailable');
				if (!results.length) {
					assert.ok(
						!body.tools.some((tool) =>
							tool.function.description?.startsWith('nexus.tools.remote / remote_project_inspect: '),
						),
					);
					return {
						name: 'tool_search',
						input: {
							query: 'remote_project_inspect collaboration_delegate remote_file_read_text_page remote_directory_list_page',
						},
					};
				}
				inspectedName = packageTool(body, 'nexus.tools.remote', 'remote_project_inspect').name;
				assert.deepEqual(
					results[0].matches.map((tool) => tool.key),
					['nexus.tools.remote.remote_project_inspect'],
				);
				if (results.length === 1) {
					return { name: inspectedName, input: { connectionId: f.connectionId, directory: project } };
				}
				assert.equal(results.length, 2);
				assert.equal(results[1].directory, project);
				assert.ok(results[1].entries.some((entry) => entry.name === 'package.json'));
				assert.ok(results[1].recommendedChecks.some((check) => check.script === 'test'));
				return { text: 'ACTUAL_DYNAMIC_CHILD_READ_COMPLETED' };
			});
			const run = await f.start('Root leaves package inspect unloaded before delegation', (results, body) => {
				for (const name of ['collaboration_delegate', 'collaboration_join', 'collaboration_cancel']) {
					const definition = findFixtureTool(body, name);
					if (definition) {
						restrictedNames.add('nexus.tools.agent.' + name);
					}
				}
				assert.ok(
					!body.tools.some((tool) =>
						tool.function.description?.startsWith('nexus.tools.remote / remote_project_inspect: '),
					),
				);
				if (!results.length) {
					return {
						name: 'tool_search',
						input: { query: 'collaboration_delegate collaboration_join collaboration_cancel' },
					};
				}
				if (results.length === 1) {
					return delegate(objective, { targets: [String(f.connectionId)] });
				}
				if (results.length === 2) {
					return {
						name: 'collaboration_join',
						input: { childIds: [results[1].id], mode: 'all', waitSeconds: 30 },
					};
				}
				assert.equal(results[2].ready, true);
				assert.equal(results[2].children[0].status, 'completed');
				assert.equal(results[2].children[0].output, 'ACTUAL_DYNAMIC_CHILD_READ_COMPLETED');
				return {};
			});
			await f.approve(await f.approval(run, 'collaboration_delegate'));
			await f.wait(run, 'completed');
			const [child] = await children(f, run, 1);
			const inherited = f.childPolicyEvidence(child).toolKeys;
			assert.ok(
				!inherited.includes('nexus.tools.remote.file_write'),
				'Child cannot grow beyond the parent capability catalog',
			);
			assert.ok(
				inherited.includes('nexus.tools.remote.remote_project_inspect'),
				'unloaded signed package declaration is frozen into Child.tools',
			);
			assert.ok(
				hidden.every((name) => !inherited.includes(name)),
				'hidden primitives never enter Child.tools',
			);
			assert.equal(restrictedNames.size, 3);
			for (const name of restrictedNames) {
				assert.ok(!inherited.includes(name));
			}
			const operations = f.operations(child);
			const parent = operations.find(
				(operation) => operation.label === 'nexus.tools.remote.remote_project_inspect',
			);
			assert.equal(parent.state, 'completed');
			const descendants = operations.filter((operation) => hidden.includes(operation.label));
			assert.ok(descendants.some((operation) => operation.label === hidden[0]));
			assert.ok(descendants.some((operation) => operation.label === hidden[1]));
			for (const operation of descendants) {
				assert.equal(operation.state, 'completed');
				const binding = JSON.parse(operation.binding_json);
				assert.equal(binding.kind, 'native');
				assert.equal(binding.capability, 'file.read');
				assert.equal(binding.target.id, f.connectionId);
				assert.equal(binding.mutation, false);
				assert.equal(operation.parent_id, parent.id);
				const proof = f.operationAuthorityEvidence(operation.id);
				assert.equal(proof.packageId, 'nexus.tools.remote');
				assert.equal(proof.instanceId, JSON.parse(parent.binding_json).binding.instanceId);
				assert.equal(
					createHash('sha256').update(operation.arguments_json).digest('hex'),
					operation.request_hash,
				);
			}
			assert.equal(f.calls.filter((call) => call.key === objective).length, 3);
			const calls = f.calls.length;
			await f.restart();
			assert.equal((await children(f, run, 1))[0].status, 'completed');
			assert.equal(f.calls.length, calls, 'completed dynamic package Child never replays after restart');
		},
		{ discover: null },
	);
	await scenario('stale fact CAS keeps the first value and never retries', async (f) => {
		const run = await f.start('fact conflict', (results) => {
			if (results.length === 2) {
				assert.equal(results[1].failure.code, 'version_conflict');
				return {};
			}
			return {
				name: 'collaboration_fact_write',
				input: {
					key: 'same-key',
					value: results.length ? 'must-not-overwrite' : 'first value',
					expectedVersion: 0,
				},
			};
		});
		await f.approve(await f.approval(run, 'collaboration_fact_write'));
		await f.approve(await f.approval(run, 'collaboration_fact_write'));
		await f.wait(run, 'completed');
		const tools = f.operations(run).filter((row) => row.label === 'nexus.tools.agent.collaboration_fact_write');
		assert.equal(tools.length, 2);
		assert.equal(tools[0].state, 'completed');
		assert.equal(tools[1].state, 'failed');
		assert.equal(tools[1].failure_code, 'version_conflict');
		assert.equal(JSON.parse(f.content(JSON.parse(tools[0].result_json).content)).fact.value, 'first value');
		assert.deepEqual(
			f.facts(run).map((fact) => ({
				key: fact.fact_key,
				value: fact.value_text,
				version: fact.version,
				authorId: fact.author_id,
			})),
			[{ key: 'same-key', value: 'first value', version: 1, authorId: run.id }],
		);
		assert.equal(f.calls.length, 4);
	});
});
