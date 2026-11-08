import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { loadCandidateHost } from '../support/candidate-host.mjs';
import { openScenarioHost } from '../support/scenario-host.mjs';

const candidate = await loadCandidateHost();

function expectStatus(response, expected) {
	assert.equal(response.status, expected);
	return response.body;
}

await writeFile(
	join(candidate.artifactRoot, 'history-combination.json'),
	JSON.stringify(candidate.combination, null, 2),
);

await test(
	'SDK4 full Unicode result and long checkpoint continue in the next Root without repeating work',
	{ timeout: 60000 },
	async (t) => {
		const { host: f } = await openScenarioHost(t, candidate, 'history-continuation');
		const answer = '完整结果🙂'.repeat(6000);
		const first = await f.start('Long immutable conversation', () => ({ text: answer }));
		await f.wait(first, 'completed');
		assert.equal(
			f
				.messageChunks(first)
				.map((item) => item.chunk.text)
				.join(''),
			answer,
		);
		const invocation = f.modelInvocations(first);
		assert.equal(invocation.length, 1);
		const nextPrompt = f.program('Continue previous conversation', (_results, body) => {
			assert.equal(body.messages.filter((item) => item.role === 'assistant').length, 1);
			assert.equal(body.messages.find((item) => item.role === 'assistant').content, answer);
			return { text: 'Prior result preserved' };
		});
		const next = expectStatus(
			await f.api(
				'POST',
				`/api/v1/agent/apps/${f.appId}/threads/${first.threadId}/runs`,
				{
					prompt: nextPrompt,
					approvalMode: 'ask',
					connectionIds: [],
					inputJson: JSON.stringify({ model: invocation[0].input.model, artifacts: [] }),
				},
				{ 'Idempotency-Key': randomUUID() },
			),
			201,
		).run;
		await f.wait(next, 'completed');
		assert.equal(f.modelInvocations(next).length, 1);
		assert.equal(f.calls.length, 2, 'Reading the previous checkpoint must not repeat its model request');
		assert.equal(
			f
				.messageChunks(next)
				.map((item) => item.chunk.text)
				.join(''),
			'Prior result preserved',
		);
	},
);

await test('SDK4 same-turn mutations serialize safely and consume ordered results', { timeout: 60000 }, async (t) => {
	const { host: f, directory } = await openScenarioHost(t, candidate, 'ordered-mutations');
	const paths = [join(directory, 'one.txt'), join(directory, 'two.txt')];
	const run = await f.start('SDK4 parallel writes', (results) => {
		if (!results.length) {
			return { name: 'tool_search', input: { query: 'file_write' } };
		}
		if (results.length === 1) {
			return {
				calls: paths.map((path, index) => ({
					name: 'file_write',
					input: {
						connectionId: f.connectionId,
						items: [{ path, content: 'batch ' + index, expectedSha256: 'absent' }],
					},
				})),
			};
		}
		assert.equal(results.length, 3);
		assert.ok(
			results.slice(1).every((result) => !result.failure),
			JSON.stringify(results),
		);
		return { text: 'Both writes settled' };
	});
	const first = await f.approval(run, 'file_write');
	await f.approve(first);
	const second = await f.approval(run, 'file_write');
	assert.notEqual(first.id, second.id);
	await f.approve(second);
	await f.wait(run, 'completed');
	for (const [index, path] of paths.entries()) {
		assert.equal(await readFile(path, 'utf8'), 'batch ' + index);
	}
});
