import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCandidateHost } from '../support/candidate-host.mjs';

const candidate = await loadCandidateHost();
await writeFile(join(candidate.artifactRoot, 'combination.json'), JSON.stringify(candidate.combination, null, 2));

for (const protocol of ['chat-completions', 'responses']) {
	await test(`Exact candidate Agent and remote tools execute through real Host (${protocol})`, async (t) => {
		const directory = join(candidate.artifactRoot, protocol);
		await mkdir(directory, { recursive: false });
		const timing = { setupMs: null, executeMs: null, drainMs: null };
		const started = performance.now();
		const host = await candidate.openAgentHost(directory, {
			packages: candidate.packages,
			packageId: 'nexus.agent',
			selectedRootIds: [
				'nexus.tools.remote',
				'nexus.tools.browser',
				'nexus.tools.integrations',
				'nexus.tools.agent',
			],
			uiPackageId: 'nexus.ui.chat',
			protocol,
		});
		timing.setupMs = performance.now() - started;
		t.after(async () => {
			const drain = performance.now();
			const closing = host.close();
			assert.equal(host.close(), closing, 'Concurrent close must share actual resource completion');
			try {
				await closing;
			} finally {
				timing.drainMs = performance.now() - drain;
				await writeFile(join(directory, 'timings.json'), JSON.stringify(timing, null, 2));
				t.diagnostic(JSON.stringify(timing));
			}
		});
		const executing = performance.now();
		const installed = await host.api('GET', '/api/v1/agent/plugins/packages');
		assert.equal(installed.status, 200);
		for (const { metadata } of candidate.packages) {
			const item = installed.body.installations.find((entry) => entry.packageId === metadata.packageId);
			assert.ok(item, 'Missing installed candidate: ' + metadata.packageId);
			assert.equal(item.status, 'installed');
			assert.equal(item.version, metadata.version);
			assert.equal(item.publisherKeyId, metadata.publisherKeyId);
			assert.equal(item.packageHash, metadata.sha256);
		}
		const run = await host.start('candidate shell', (results) => {
			if (results.length === 0) {
				return { name: 'tool_search', input: { query: 'shell_execute' } };
			}
			assert.ok(results[0].loadKeys.some((key) => key.includes('shell_execute')));
			if (results.length === 1) {
				return {
					name: 'shell_execute',
					input: {
						connectionId: host.connectionId,
						commands: ["printf '候选🙂'; printf 'stderr' >&2; exit 7"],
					},
				};
			}
			return { text: 'Candidate result confirmed' };
		});
		const approval = await host.approval(run, 'shell_execute');
		assert.equal(
			host.operations(run).some((row) => row.state === 'completed' && row.label === 'shell.execute'),
			false,
		);
		await host.approve(approval);
		await host.wait(run, 'completed');
		assert.equal(host.calls.length, 3, 'Discovery, execution result, and final response are separate model turns');
		const tool = host.operations(run).find((row) => row.label === 'nexus.tools.remote.shell_execute');
		assert.equal(tool.state, 'completed');
		const result = JSON.parse(host.content(JSON.parse(tool.result_json).content));
		assert.deepEqual(result.commands[0], {
			index: 0,
			status: 'nonzero',
			exitCode: 7,
			signal: null,
			stdout: '候选🙂',
			stderr: 'stderr',
			truncated: false,
		});
		assert.equal(
			host
				.messageChunks(run)
				.map(({ chunk }) => chunk.text)
				.join(''),
			'Candidate result confirmed',
		);
		timing.executeMs = performance.now() - executing;
	});
}

await test('Exact candidate cancellation closes a live model stream without replay', async (t) => {
	const directory = join(candidate.artifactRoot, 'cancel');
	await mkdir(directory, { recursive: false });
	const started = performance.now();
	const host = await candidate.openAgentHost(directory, {
		packages: candidate.packages.filter(({ metadata }) => metadata.packageId === 'nexus.agent'),
		packageId: 'nexus.agent',
		selectedRootIds: [],
		uiPackageId: null,
		protocol: 'chat-completions',
	});
	const timing = { setupMs: performance.now() - started, executeMs: null, drainMs: null };
	t.after(async () => {
		const drain = performance.now();
		try {
			await host.close();
		} finally {
			timing.drainMs = performance.now() - drain;
			await writeFile(join(directory, 'timings.json'), JSON.stringify(timing, null, 2));
			t.diagnostic(JSON.stringify(timing));
		}
	});
	const executing = performance.now();
	const run = await host.start('candidate cancel', () => ({ chunks: ['候选prefix🙂'], hold: true }));
	await candidate.waitForHost(
		() =>
			host
				.messageChunks(run)
				.map(({ chunk }) => chunk.text)
				.join(''),
		(text) => text === '候选prefix🙂',
		'Candidate prefix persisted before cancellation',
	);
	await host.cancel(run);
	await host.wait(run, 'cancelled');
	await candidate.waitForHost(
		() => host.heldModelCount,
		(count) => count === 0,
		'Original provider stream closed',
	);
	assert.equal(host.calls.length, 1);
	assert.equal(
		host
			.messageChunks(run)
			.map(({ chunk }) => chunk.text)
			.join(''),
		'候选prefix🙂',
	);
	timing.executeMs = performance.now() - executing;
});
