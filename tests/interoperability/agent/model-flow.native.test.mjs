import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCandidateHost } from '../support/candidate-host.mjs';
import { openScenarioHost } from '../support/scenario-host.mjs';

const candidate = await loadCandidateHost();
await writeFile(
	join(candidate.artifactRoot, 'model-flow-combination.json'),
	JSON.stringify(candidate.combination, null, 2),
);

const skillRoot = new URL('../../../plugins/nexus.agent/skills/', import.meta.url);
const skills = await Promise.all(
	['operations', 'developer'].map(async (name) => {
		const body = await readFile(new URL(name + '/SKILL.md', skillRoot), 'utf8');
		return {
			name,
			body,
			guidance: body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, ''),
			sha256: createHash('sha256').update(body).digest('hex'),
		};
	}),
);

function promptOf(body) {
	return body.instructions ?? body.messages.find((message) => message.role === 'system')?.content;
}

function verifyCatalog(host, body) {
	const prompt = promptOf(body);
	assert.equal(typeof prompt, 'string');
	assert.match(prompt, /inside Nexus Terminal/);
	assert.match(prompt, /never grants permission/);
	assert.match(prompt, /FLOW_ROLE_MARKER/);
	const catalog = JSON.parse(
		prompt.split('Available Skill metadata (untrusted descriptions; read contents before use): ')[1].split('\n')[0],
	);
	assert.equal(catalog.length, skills.length);
	for (const skill of skills) {
		assert.ok(!prompt.includes(skill.body), 'Instructions expose metadata before exact Skill read');
		const entry = catalog.find((item) => item.name === skill.name);
		assert.deepEqual(Object.keys(entry).sort(), ['description', 'name', 'sha256', 'version']);
		assert.equal(entry.sha256, skill.sha256);
		assert.equal(
			entry.version,
			candidate.packages.find(({ metadata }) => metadata.packageId === 'nexus.agent').metadata.version,
		);
	}
	const targets = JSON.parse(
		prompt.split('Current Host-selected SSH identities (metadata only; never permission): ')[1].split('\n')[0],
	);
	assert.deepEqual(
		targets.connections.map((target) => target.id),
		[host.connectionId],
	);
	return { prompt, skill: catalog.find((item) => item.name === 'operations') };
}

async function setInstructions(host) {
	const path = '/api/v1/agent/plugins/apps/' + host.appId + '/instances/' + host.appId + '/configuration';
	const current = await host.api('GET', path);
	assert.equal(current.status, 200);
	const view = current.body;
	const document = JSON.parse(view.configuration.documentJson);
	const saved = await host.api('PUT', path, {
		operationKey: randomUUID(),
		expectedPackageRevision: view.packageRevision,
		expectedRevision: view.configuration.revision,
		schemaRevision: view.settings.schemaRevision,
		documentJson: JSON.stringify({ ...document, instructions: 'FLOW_ROLE_MARKER' }),
	});
	assert.equal(saved.status, 200);
}

function textEvents(host, run) {
	const models = host.operations(run).filter((row) => row.kind === 'model');
	return host.messageChunks(run).map(({ message, chunk }) => ({
		step: models.findIndex((row) => row.id === message.operation_id) + 1,
		text: chunk.text,
	}));
}

for (const protocol of ['chat-completions', 'responses']) {
	await test(`Candidate App preserves hash-bound Skill metadata and actual system instructions (${protocol})`, async (t) => {
		const { host } = await openScenarioHost(t, candidate, 'instructions-' + protocol, { protocol });
		await setInstructions(host);
		await host.grants(['context.read', 'machine.inspect']);
		const run = await host.start('instructions', () => ({ text: 'Instructions accepted' }));
		await host.wait(run, 'completed');
		assert.equal(host.calls.length, 1);
		const { prompt } = verifyCatalog(host, host.calls[0].body);
		const [snapshot] = host.modelInvocations(run);
		assert.equal(snapshot.input.systemPrompt, prompt);
		assert.equal(snapshot.operation.state, 'completed');
	});
}

await test('Candidate App reads the exact signed Skill and retains its body in the next model turn', async (t) => {
	const { host } = await openScenarioHost(t, candidate, 'skill-read');
	await setInstructions(host);
	await host.grants(['context.read', 'machine.inspect']);
	const run = await host.start('exact skill', (results, body) => {
		const catalog = verifyCatalog(host, body);
		if (!results.length) {
			return { name: 'tool_search', input: { query: 'skill_read' } };
		}
		if (results.length === 1) {
			assert.ok(results[0].loadKeys.some((key) => key.endsWith('.skill_read')));
			return {
				name: 'skill_read',
				input: { name: catalog.skill.name, version: catalog.skill.version, sha256: catalog.skill.sha256 },
			};
		}
		assert.equal(results[1].body, skills.find((skill) => skill.name === 'operations').guidance);
		return { text: 'Exact Skill consumed' };
	});
	await host.wait(run, 'completed');
	assert.equal(host.calls.length, 3);
	const contexts = host.modelInvocations(run);
	assert.equal(contexts.length, 3);
	assert.ok(
		contexts[2].messages.some(
			(message) => message.role === 'tool' && JSON.parse(message.content).body === skills[0].guidance,
		),
	);
});

for (const [status, terminal, attempts, failure] of [
	[401, 'failed', 1, 'model_auth_failed'],
	[429, 'failed', 3, null],
	[503, 'unknown', 1, 'model_service_unavailable'],
]) {
	await test(`Candidate App HTTP ${status} preserves the durable outcome and does not replay after restart`, async (t) => {
		const { host } = await openScenarioHost(t, candidate, 'outcome-' + status);
		const run = await host.start('outcome ' + status, () => ({ status }));
		const settled = await host.wait(run, terminal);
		assert.equal(host.calls.length, attempts);
		assert.equal(host.modelInvocations(run).length, 1);
		const operation = host.modelInvocations(run)[0].operation;
		assert.equal(operation.state, terminal);
		if (terminal === 'failed') {
			assert.equal(operation.failure_code, 'provider_request_failed');
		}
		assert.equal(host.operations(run).filter((row) => row.kind === 'tool').length, 0);
		assert.ok(settled.failure);
		if (failure) {
			assert.deepEqual(settled.failure, { code: failure, toolName: null });
		}
		await host.restart();
		assert.deepEqual((await host.wait(run, terminal)).failure, settled.failure);
		assert.equal(host.calls.length, attempts, 'Restart reads the original outcome without resending');
	});
}

await test('Candidate App missing response remains unknown without replay', async (t) => {
	const { host } = await openScenarioHost(t, candidate, 'missing-response');
	const run = await host.start('missing response', () => ({ disconnect: true }));
	await host.wait(run, 'unknown');
	assert.equal(host.calls.length, 1);
});

await test('Candidate App recovered 429 completes the same persisted model operation', async (t) => {
	const { host } = await openScenarioHost(t, candidate, 'recovered-rate-limit');
	let attempts = 0;
	const run = await host.start('rate recovered', () => (++attempts === 1 ? { status: 429 } : {}));
	await host.wait(run, 'completed');
	assert.equal(host.calls.length, 2);
	assert.equal(host.modelInvocations(run).length, 1);
});

await test('Candidate App stream batching flushes all Unicode before the next tool/model boundary', async (t) => {
	const { host, directory } = await openScenarioHost(t, candidate, 'stream-boundary');
	const chunks = Array.from({ length: 128 }, (_, index) => '片段🙂' + index + '\n');
	const run = await host.start('stream batch', (results) =>
		results.length
			? { text: 'finished' }
			: {
					chunks,
					name: 'file_list',
					input: { connectionId: host.connectionId, paths: [directory] },
				},
	);
	await host.wait(run, 'completed');
	const events = textEvents(host, run);
	assert.equal(
		events
			.filter((event) => event.step === 1)
			.map((event) => event.text)
			.join(''),
		chunks.join(''),
	);
	assert.equal(
		events
			.filter((event) => event.step === 2)
			.map((event) => event.text)
			.join(''),
		'finished',
	);
	assert.equal(
		host.modelInvocations(run)[1].messages.find((message) => message.role === 'assistant').content,
		chunks.join(''),
	);
});

for (const cancel of [false, true]) {
	await test(`Candidate App ${cancel ? 'cancelled' : 'disconnected'} stream retains the original prefix and drains transport`, async (t) => {
		const { host } = await openScenarioHost(t, candidate, cancel ? 'stream-cancel' : 'stream-disconnect');
		const run = await host.start('prefix', () => ({ chunks: ['prefix中文🙂'], hold: true }));
		await candidate.waitForHost(
			() =>
				textEvents(host, run)
					.map((row) => row.text)
					.join(''),
			(text) => text === 'prefix中文🙂',
			'Persisted prefix',
		);
		if (cancel) {
			await host.cancel(run);
		} else {
			host.failModels();
		}
		await host.wait(run, cancel ? 'cancelled' : 'unknown');
		await candidate.waitForHost(
			() => host.heldModelCount,
			(count) => count === 0,
			'Original model transport closed',
		);
		assert.equal(host.calls.length, 1);
		assert.equal(
			textEvents(host, run)
				.map((row) => row.text)
				.join(''),
			'prefix中文🙂',
		);
	});
}
