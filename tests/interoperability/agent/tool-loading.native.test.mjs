import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENT_CAPABILITIES } from '@nexus-terminal/shared/agent/governance/values';
import { loadCandidateHost } from '../support/candidate-host.mjs';
import { openScenarioHost } from '../support/scenario-host.mjs';

const candidate = await loadCandidateHost();
const until = candidate.waitForHost;
await writeFile(
	join(candidate.artifactRoot, 'tool-loading-combination.json'),
	JSON.stringify(candidate.combination, null, 2),
);

const packages = {
	file_read: 'nexus.tools.remote',
	file_list: 'nexus.tools.remote',
	file_inspect: 'nexus.tools.remote',
	file_search: 'nexus.tools.remote',
	remote_project_inspect: 'nexus.tools.remote',
	file_write: 'nexus.tools.remote',
	browser_screenshot: 'nexus.tools.browser',
	browser_click: 'nexus.tools.browser',
	browser_snapshot: 'nexus.tools.browser',
	tool_search: 'nexus.tools.agent',
	collaboration_delegate: 'nexus.tools.agent',
};

const names = (body) => body.tools.map((tool) => (tool.function ?? tool).name);

const exactKey = (name) => {
	assert.ok(packages[name], 'Missing independent expected package: ' + name);
	return packages[name] + '.' + name;
};

function findFixtureTool(body, reference) {
	if (typeof reference === 'string' && reference.startsWith('nt_')) {
		return body.tools.map((entry) => entry.function ?? entry).find((entry) => entry.name === reference);
	}
	const name = typeof reference === 'string' ? reference : reference.name;
	const matches = body.tools
		.map((entry) => entry.function ?? entry)
		.filter((entry) => /^nt_[a-f0-9]{12}_/u.test(entry.name) && entry.name.endsWith('_' + name));
	assert.ok(matches.length <= 1, 'Ambiguous candidate tool: ' + name);
	return matches[0];
}

function fixtureToolName(body, reference) {
	const definition = findFixtureTool(body, reference);
	assert.ok(definition, 'Candidate tool must be actually exposed: ' + JSON.stringify(reference));
	return definition.name;
}

const packageTool = (body, packageId, name) => {
	assert.equal(packages[name], packageId, 'Expected package identity for initial contribution');
	const definition = findFixtureTool(body, name);
	assert.ok(definition, 'Expected installed contribution ' + name);
	return definition;
};

const rawToolName = (name) => ({ rawToolName: name });

const toolRows = (f, run) => f.operations(run).filter((row) => row.kind === 'tool');

const search = (query) => ({ name: 'tool_search', input: { query } });

const inspect = (f, path) => ({ name: 'file_inspect', input: { connectionId: f.connectionId, paths: [path] } });

for (const protocol of ['chat-completions', 'responses']) {
	await test('Agent tool loading: ' + protocol, { timeout: 90000 }, async (t) => {
		let sequence = 0;

		async function scenario(name, work, options = {}) {
			await t.test(name, async (tc) => {
				const { host, directory } = await openScenarioHost(
					tc,
					candidate,
					'tool-loading-' + protocol + '-' + ++sequence,
					{
						packages: candidate.packages,
						selectedRootIds: [
							'nexus.tools.remote',
							'nexus.tools.browser',
							'nexus.tools.integrations',
							'nexus.tools.agent',
						],
						protocol,
						...options,
					},
				);
				const path = join(directory, 'sample.txt');
				await writeFile(path, 'tool discovery evidence');
				await host.grants(['context.read', 'file.read', 'browser.read', 'artifacts.write']);
				await work(host, path);
			});
		}

		{
			await scenario(
				'exact discovery supplies schemas next turn and reuses stable definitions',
				async (f, path) => {
					let initialBytes;
					let loadedNames;
					const run = await f.start('exact discovery', (results, body) => {
						const offered = names(body);
						if (!results.length) {
							assert.ok(
								Boolean(findFixtureTool(body, 'tool_search')) &&
									offered.includes(packageTool(body, 'nexus.tools.remote', 'file_read').name) &&
									offered.includes(packageTool(body, 'nexus.tools.remote', 'file_list').name),
							);
							assert.ok(!offered.includes('file_read') && !offered.includes('file_list'));
							assert.ok(packageTool(body, 'nexus.tools.remote', 'file_read').parameters.properties.paths);
							assert.ok(packageTool(body, 'nexus.tools.remote', 'file_list').parameters.properties.paths);
							assert.ok(
								!Boolean(findFixtureTool(body, 'file_inspect')) &&
									!Boolean(findFixtureTool(body, 'browser_screenshot')),
							);
							initialBytes = Buffer.byteLength(JSON.stringify(body.tools));
							return search('file_inspect');
						}
						assert.equal(results[0].availableNextTurn, true);
						assert.deepEqual(
							results[0].matches.map((tool) => tool.key),
							[exactKey('file_inspect')],
						);
						assert.deepEqual(Object.keys(results[0].matches[0]).sort(), ['key', 'summary']);
						assert.ok(results[0].matches[0].summary.length > 0);
						const definition = body.tools.find(
							(tool) => (tool.function?.name ?? tool.name) === fixtureToolName(body, 'file_inspect'),
						);
						assert.ok((definition.function ?? definition).parameters.properties.paths);
						if (results.length === 1) {
							loadedNames = offered;
							assert.ok(Buffer.byteLength(JSON.stringify(body.tools)) > initialBytes);
							return inspect(f, path);
						}
						assert.deepEqual(offered, loadedNames);
						assert.equal(results[1].items[0].value.path, path);
						return results.length === 2 ? inspect(f, path) : {};
					});
					await f.wait(run, 'completed');
					assert.equal(f.calls.length, 4);
					assert.deepEqual(
						toolRows(f, run).map((tool) => [tool.label.split('.').at(-1), tool.state]),
						[
							['tool_search', 'completed'],
							['file_inspect', 'completed'],
							['file_inspect', 'completed'],
						],
					);
					// A fresh Run does not inherit the previous Run's loaded set.
					const next = await f.start('fresh discovery', (_results, body) => {
						assert.ok(!Boolean(findFixtureTool(body, 'file_inspect')));
						return {};
					});
					await f.wait(next, 'completed');
				},
			);
			await scenario(
				'unknown names return no matches and Chinese keywords load only the requested capability',
				async (f, path) => {
					const run = await f.start('bilingual discovery', (results, body) => {
						if (!results.length) {
							return search('nonexistent_tool');
						}
						assert.deepEqual(results[0].matches, []);
						if (results.length === 1) {
							return search('浏览器截图');
						}
						assert.deepEqual(
							results[1].matches.map((tool) => tool.key),
							[exactKey('browser_screenshot')],
						);
						assert.ok(Boolean(findFixtureTool(body, 'browser_screenshot')));
						assert.ok(!Boolean(findFixtureTool(body, 'browser_click')));
						return {};
					});
					await f.wait(run, 'completed');
				},
			);
			await scenario(
				'overlapping parallel searches and repeated discovery keep schemas unique and stable',
				async (f, path) => {
					let loadedNames;
					const run = await f.start('parallel discovery', (results, body) => {
						const offered = names(body);
						assert.equal(new Set(offered).size, offered.length);
						if (!results.length) {
							return { calls: [search('file_inspect'), search('file_inspect browser_screenshot')] };
						}
						assert.deepEqual(
							results[0].matches.map((tool) => tool.key),
							[exactKey('file_inspect')],
						);
						assert.deepEqual(
							results[1].matches.map((tool) => tool.key).sort(),
							['browser_screenshot', 'file_inspect'].map(exactKey).sort(),
						);
						assert.ok(
							Boolean(findFixtureTool(body, 'file_inspect')) &&
								Boolean(findFixtureTool(body, 'browser_screenshot')),
						);
						if (results.length === 2) {
							loadedNames = offered;
							return search('file_inspect');
						}
						assert.deepEqual(offered, loadedNames);
						if (results.length === 3) {
							return inspect(f, path);
						}
						assert.equal(results[3].items[0].value.path, path);
						return {};
					});
					await f.wait(run, 'completed');
					assert.deepEqual(
						toolRows(f, run).map((tool) => [tool.label.split('.').at(-1), tool.state]),
						[
							['tool_search', 'completed'],
							['tool_search', 'completed'],
							['tool_search', 'completed'],
							['file_inspect', 'completed'],
						],
					);
				},
			);
			await scenario('invalid discovery parameters recover without exposing schemas', async (f, path) => {
				let initialNames;
				const run = await f.start('discovery parameter recovery', (results, body) => {
					if (!results.length) {
						initialNames = names(body);
						return search(' ');
					}
					assert.equal(results[0].failure.code, 'invalid_input');
					if (results.length === 1) {
						assert.deepEqual(names(body), initialNames);
						return search('file_inspect');
					}
					assert.ok(Boolean(findFixtureTool(body, 'file_inspect')));
					if (results.length === 2) {
						return inspect(f, path);
					}
					assert.equal(results[2].items[0].value.path, path);
					return {};
				});
				await f.wait(run, 'completed');
				assert.deepEqual(
					toolRows(f, run).map((tool) => [tool.label.split('.').at(-1), tool.state]),
					[
						['tool_search', 'failed'],
						['tool_search', 'completed'],
						['file_inspect', 'completed'],
					],
				);
			});
			await scenario(
				'discovery cannot expose an unselected package root',
				async (f, path) => {
					const run = await f.start('selected roots only', (results, body) => {
						if (!results.length) {
							return search('file_inspect');
						}
						assert.deepEqual(results[0].matches, []);
						assert.deepEqual(results[0].loadKeys, []);
						assert.ok(!findFixtureTool(body, 'file_inspect'));
						assert.ok(!findFixtureTool(body, 'file_read'));
						return {};
					});
					await f.wait(run, 'completed');
				},
				{ selectedRootIds: ['nexus.tools.agent'] },
			);
			await scenario('same-turn search cannot authorize an unloaded call in its batch', async (f, path) => {
				let unloaded;
				const capture = await f.start('capture actual inspect identity', (results, body) => {
					if (!results.length) {
						return search('file_inspect');
					}
					unloaded = fixtureToolName(body, 'file_inspect');
					return {};
				});
				await f.wait(capture, 'completed');
				const previousCalls = f.calls.length;
				const run = await f.start('same turn rejection', () => ({
					calls: [search('file_inspect'), { ...inspect(f, path), name: rawToolName(unloaded) }],
				}));
				assert.equal((await f.wait(run, 'unknown')).failure.code, 'model_response_invalid');
				assert.equal(f.calls.length, previousCalls + 1);
				assert.deepEqual(toolRows(f, run), []);
			});
			await scenario(
				'discovery excludes denied capabilities and SSH tools without selected targets',
				async (f, path) => {
					await f.grants(['context.read', 'file.read', 'file.write', 'browser.read']);
					const run = await f.start(
						'target and permission filtering',
						(results, body) => {
							if (!results.length) {
								return search(
									'file_inspect file_write browser_click browser_screenshot browser_snapshot acp_integration_list',
								);
							}
							assert.deepEqual(
								results[0].matches.map((tool) => tool.key),
								[exactKey('browser_snapshot')],
							);
							assert.ok(
								!body.tools.some((entry) =>
									(entry.function ?? entry).description?.startsWith(
										'nexus.tools.remote / file_read: ',
									),
								),
							);
							return {};
						},
						{ connectionIds: [] },
					);
					await f.wait(run, 'completed');
				},
			);
			await scenario(
				'live revocation removes a loaded tool while its completed history remains valid',
				async (f, path) => {
					const run = await f.start('revoked discovery', async (results, body) => {
						if (!results.length) {
							return search('file_inspect');
						}
						if (results.length === 1) {
							assert.ok(Boolean(findFixtureTool(body, 'file_inspect')));
							await f.grants(['context.read']);
							return search('file_inspect');
						}
						assert.deepEqual(results[1].matches, []);
						assert.ok(!Boolean(findFixtureTool(body, 'file_inspect')));
						return {};
					});
					await f.wait(run, 'completed');
					assert.equal(toolRows(f, run).length, 2);
				},
			);
			await scenario('a stale offered schema cannot execute after revocation', async (f, path) => {
				const run = await f.start('revoke before execution', async (results) => {
					if (!results.length) {
						return search('file_inspect');
					}
					await f.grants(['context.read']);
					return inspect(f, path);
				});
				const denied = await f.wait(run, 'failed');
				assert.equal(denied.failure.code, 'configuration_changed');
				assert.equal(f.calls.length, 2);
				assert.ok(
					!toolRows(f, run).some(
						(tool) => tool.label === exactKey('file_inspect') && tool.state === 'completed',
					),
				);
			});
			await scenario(
				'an App without a loader exposes every authorized selected contribution',
				async (f, path) => {
					const run = await f.start('no search provider', (results, body) => {
						assert.ok(!findFixtureTool(body, 'tool_search'));
						for (const name of [
							'file_read',
							'file_list',
							'file_inspect',
							'file_search',
							'remote_project_inspect',
						]) {
							assert.ok(findFixtureTool(body, name));
						}
						assert.ok(!findFixtureTool(body, 'file_write'));
						return results.length ? {} : inspect(f, path);
					});
					await f.wait(run, 'completed');
				},
				{ selectedRootIds: ['nexus.tools.remote'] },
			);
			await scenario('explicit full-catalog discovery exposes all authorized schemas', async (f, path) => {
				await f.grants(AGENT_CAPABILITIES);
				let initialBytes;
				let initialCount;
				const run = await f.start('full catalog discovery', (results, body) => {
					if (!results.length) {
						initialBytes = Buffer.byteLength(JSON.stringify(body.tools));
						initialCount = body.tools.length;
						return search('*');
					}
					const loaded = results[0].loadKeys;
					assert.deepEqual(
						results[0].matches.map((tool) => tool.key),
						loaded,
					);
					assert.equal(new Set(loaded).size, loaded.length);
					const declarations = loaded.map((key) =>
						fixtureToolName(body, {
							packageId: key.split('.').slice(0, -1).join('.'),
							name: key.split('.').at(-1),
						}),
					);
					assert.deepEqual(
						declarations.sort(),
						names(body)
							.filter((name) => name !== fixtureToolName(body, 'tool_search'))
							.sort(),
					);
					assert.ok(body.tools.length > initialCount);
					console.info(
						'TOOL_LOADING_WIRE_MEASUREMENT ' +
							JSON.stringify({
								protocol,
								initialCount,
								fullCount: body.tools.length,
								initialBytes,
								fullBytes: Buffer.byteLength(JSON.stringify(body.tools)),
							}),
					);
					return {};
				});
				await f.wait(run, 'completed');
			});
			await scenario(
				'Child loading is independent and cannot discover delegation outside its inherited bound',
				async (f, path) => {
					await f.grants(['context.read', 'file.read', 'app.intents.exchange']);
					const programFailures = [];

					function checkedProgram(program) {
						return async (...args) => {
							try {
								return await program(...args);
							} catch (error) {
								programFailures.push(error);
								throw error;
							}
						};
					}

					const childObjective = f.program(
						'child discovery',
						checkedProgram((results, body) => {
							if (!results.length) {
								assert.ok(!Boolean(findFixtureTool(body, 'file_inspect')));
								return search('file_inspect collaboration_delegate');
							}
							assert.deepEqual(
								results[0].matches.map((tool) => tool.key),
								[exactKey('file_inspect')],
							);
							assert.ok(!Boolean(findFixtureTool(body, 'collaboration_delegate')));
							return results.length === 1 ? inspect(f, path) : {};
						}),
					);
					const run = await f.start(
						'parent discovery',
						checkedProgram((results) => {
							if (!results.length) {
								return search('collaboration_delegate collaboration_join file_inspect');
							}
							if (results.length === 1) {
								return {
									name: 'collaboration_delegate',
									input: {
										profile: 'explore',
										objective: childObjective,
										targets: [String(f.connectionId)],
										dependencyMode: 'success',
									},
								};
							}
							if (results.length === 2) {
								return {
									name: 'collaboration_join',
									input: {
										childIds: [results[1].id],
										mode: 'all',
										waitSeconds: 5,
									},
								};
							}
							if (!results[2].ready) {
								const child = results[2].children[0];

								const journal = (run) =>
									toolRows(f, run).map((row) => ({
										key: row.label,
										state: row.state,
										createdAt: row.created_at,
										updatedAt: row.updated_at,
									}));

								console.info(
									'TOOL_LOADING_CHILD_JOIN_JOURNAL ' +
										JSON.stringify({
											protocol,
											join: results[2],
											parentTools: journal({ id: child.parentId }),
											childTools: journal(child),
										}),
								);
							}
							assert.equal(results[2].ready, true, JSON.stringify(results[2]));
							assert.equal(results[2].children[0].status, 'completed');
							return {};
						}),
					);
					await f.approve(await f.approval(run, 'collaboration_delegate'));
					try {
						await f.wait(run, 'completed');
					} catch (error) {
						throw new AggregateError(
							[error, ...programFailures],
							'Child discovery provider assertions\n' +
								[error, ...programFailures].map((cause) => cause.stack ?? String(cause)).join('\n'),
						);
					}
					assert.equal(f.calls.filter((call) => call.key === childObjective).length, 3);
				},
			);

			await scenario('cancelled in-flight search cannot cause a later model dispatch', async (f) => {
				const barrier = f.pauseToolResults([{ key: exactKey('tool_search') }]);
				const run = await f.start('cancel discovery', () => search('file_inspect'));
				await until(
					() => barrier.started.length,
					(count) => count === 1,
					'Actual search reached delivery fence',
				);
				await f.cancel(run);
				barrier.release(0);
				await f.wait(run, 'cancelled');
				assert.equal(f.calls.length, 1);
				const parents = toolRows(f, run);
				assert.equal(parents.length, 1);
				assert.equal(parents[0].label, exactKey('tool_search'));
				await until(
					() => toolRows(f, run)[0].state,
					(state) => state === 'cancelled',
					'Accepted search drains',
				);
				assert.ok(
					!f.operations(run).some((row) => row.label.startsWith('discovery.')),
					'Search is package-owned; it must not dispatch removed Host discovery operations',
				);
			});
		}
	});
}
