import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openPackageRuntime } from '../../../../tests/support/packages/package-runtime.mjs';
import { listPage, textPage } from '../../../../tests/support/packages/remote-pages.mjs';

test('remote project algorithm combines the package read/list algorithms through registered Host capabilities', async (t) => {
	const calls = [];
	const remote = await openPackageRuntime('nexus.tools.remote', async (input) => {
		calls.push(input);
		return input.operation === 'remote.listPage'
			? listPage(['Cargo.toml', 'package.json'])
			: textPage(
					input,
					JSON.stringify({
						name: 'example',
						scripts: { check: 'tsc', build: 'vite build', start: 'node index.js' },
						dependencies: { vue: '3' },
					}),
				);
	});
	t.after(() => remote.close());
	const value = await remote.invoke('remote_project_inspect', { connectionId: 1, directory: '/project' });
	assert.deepEqual(
		calls.map((call) => call.operation),
		['remote.listPage', 'remote.readTextPage'],
	);
	assert.deepEqual(value.ecosystems, ['rust']);
	assert.equal(value.manifests[0].summary.name, 'example');
	assert.deepEqual(value.recommendedChecks, [
		{ file: 'package.json', script: 'check' },
		{ file: 'package.json', script: 'build' },
	]);
});

test('file batches preserve per-item refusal, exact pages and encoded result capacity', async (t) => {
	let calls = 0;
	const remote = await openPackageRuntime('nexus.tools.remote', async (input) => {
		calls++;
		if (input.path === '/missing') {
			return { status: 'not_found' };
		}
		if (input.path === '/binary') {
			return { status: 'not_text' };
		}
		return textPage(input, 'x'.repeat(32768));
	});
	t.after(() => remote.close());
	const result = await remote.invoke('file_read', { connectionId: 1, paths: ['/missing', '/binary', '/text'] });
	assert.equal(result.items[0].failureCode, 'not_found');
	assert.equal(result.items[1].failureCode, 'not_text');
	assert.equal(result.items[2].value.text.length, 32768);
	assert.equal(result.nextIndex, null);
	const before = calls;
	const large = await remote.invoke('file_read', {
		connectionId: 1,
		paths: Array.from({ length: 16 }, (_, index) => `/text-${index}`),
	});
	assert.equal(large.nextIndex, 7);
	assert.equal(calls - before, 8);
	assert.ok(Buffer.byteLength(JSON.stringify(large)) < 256 * 1024);
	const crowded = await openPackageRuntime('nexus.tools.remote', async () =>
		listPage(Array.from({ length: 200 }, (_, index) => String(index).padStart(3, '0') + '\u0001'.repeat(252))),
	);
	t.after(() => crowded.close());
	await assert.rejects(
		crowded.invoke('file_list', { connectionId: 1, paths: ['/large'] }),
		(error) => error.code === 'limit_exceeded',
	);
});

test('remote package preserves cancellation and typed Host rejection without replay', async (t) => {
	let calls = 0;
	const remote = await openPackageRuntime('nexus.tools.remote', async () => {
		calls++;
		return { failure: 'operation_unknown' };
	});
	t.after(() => remote.close());
	await assert.rejects(
		remote.invoke('remote_project_inspect', { connectionId: 1, directory: '/project' }),
		(error) => error.code === 'operation_unknown',
	);
	assert.equal(calls, 1);
	const cancelled = new AbortController();
	const next = await openPackageRuntime('nexus.tools.remote', async () => {
		calls++;
		cancelled.abort();
		return listPage(['package.json']);
	});
	t.after(() => next.close());
	await assert.rejects(
		next.invoke('remote_project_inspect', { connectionId: 1, directory: '/project' }, cancelled.signal),
	);
	assert.equal(calls, 2);
	next.runtime.quiesce(Date.now());
	await assert.rejects(
		next.invoke('remote_project_inspect', { connectionId: 1, directory: '/project' }),
		(error) => error.code === 'provider_unavailable',
	);
	assert.equal(calls, 2);
});

test('late Host replies cannot revive a quiesced package or cross into its replacement', async (t) => {
	let resolveReply;
	let started;
	const reply = new Promise((resolve) => {
		resolveReply = resolve;
	});
	const entered = new Promise((resolve) => {
		started = resolve;
	});
	const remote = await openPackageRuntime('nexus.tools.remote', async () => {
		started();
		return reply;
	});
	t.after(() => remote.close());
	const pending = remote.invoke('file_list', { connectionId: 1, paths: ['/project'] });
	const rejected = assert.rejects(pending);
	await entered;
	remote.runtime.quiesce(Date.now());
	const replacement = await openPackageRuntime('nexus.tools.remote', async () => {
		throw new Error('Replacement must not receive an old invocation');
	});
	t.after(() => replacement.close());
	resolveReply(listPage(['AGENTS.md']));
	await rejected;
	assert.equal(remote.runtime.health(), false);
	assert.equal(replacement.runtime.health(), true);
});

test('file_read preserves UTF-8 byte cursors, hashes and requested page bounds', async (t) => {
	const calls = [];
	const remote = await openPackageRuntime('nexus.tools.remote', async (input) => {
		calls.push(input);
		const offset = input.offset;
		return {
			status: 'ok',
			value: {
				path: '/utf8',
				text: offset === 0 ? '你a' : '🙂',
				bytes: 4,
				sizeBytes: 8,
				offset,
				nextOffset: offset === 0 ? 4 : null,
				sha256: null,
				pageSha256: (offset === 0 ? 'a' : 'b').repeat(64),
				fingerprint: 'c'.repeat(64),
			},
		};
	});
	t.after(() => remote.close());
	const first = (await remote.invoke('file_read', { connectionId: 1, paths: ['/utf8'], offset: 0, maxBytes: 4 }))
		.items[0].value;
	const second = (
		await remote.invoke('file_read', { connectionId: 1, paths: ['/utf8'], offset: first.nextOffset, maxBytes: 4 })
	).items[0].value;
	assert.equal(first.text + second.text, '你a🙂');
	assert.equal(first.nextOffset, 4);
	assert.equal(second.nextOffset, null);
	assert.equal(first.sha256, null);
	assert.equal(second.pageSha256, 'b'.repeat(64));
	assert.deepEqual(
		calls.map((call) => ({ offset: call.offset, maxBytes: call.maxBytes })),
		[
			{ offset: 0, maxBytes: 4 },
			{ offset: 4, maxBytes: 4 },
		],
	);
});

test('file input rejects duplicate normalized paths before invoking any Host capability', async (t) => {
	let calls = 0;
	const remote = await openPackageRuntime('nexus.tools.remote', async () => {
		calls++;
		throw new Error('Capability must not run');
	});
	t.after(() => remote.close());
	for (const paths of [['/a/./b', '/a/b'], ['/a/../b'], ['relative']]) {
		await assert.rejects(
			remote.invoke('file_read', { connectionId: 1, paths }),
			(error) => error.code === 'invalid_input',
		);
	}
	assert.equal(calls, 0);
});
