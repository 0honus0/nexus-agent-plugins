import * as sharedCatalogCodec from '@nexus-terminal/shared/agent/plugins/repository-http-codec';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectArtifact, sha256 } from './lib/package-artifact.mjs';
import { openPackageRuntime } from './test-runtime.mjs';
import { readAgentPluginFrontendInput } from '@nexus-terminal/shared/agent/plugins/frontend-rpc-codec';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script, ...args) {
	return execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

test('third-party template uses the shared contract, V4 signature, immutable releases and independent catalog aggregation', () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-package-test-'));
	try {
		const keys = generateKeyPairSync('ed25519');
		const keyPath = path.join(temp, 'key.pem');
		const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
		fs.writeFileSync(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
		const source = path.join(temp, 'third-party');
		fs.cpSync(path.join(root, 'templates/fullstack'), source, { recursive: true });
		const manifestPath = path.join(source, 'manifest.json');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
		manifest.id = 'example.thirdparty';
		manifest.displayName = 'Independent Third Party';
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));
		run('check.mjs', source);
		const first = JSON.parse(
			run('build-release.mjs', source, keyPath, temp, 'https://example.invalid/third-party'),
		);
		const original = fs.readFileSync(first.packagePath);
		const inspected = inspectArtifact(first.packagePath, publicKey);
		assert.equal(inspected.manifest.id, 'example.thirdparty');
		assert.equal(inspected.manifest.schemaVersion, 4);
		run('build-release.mjs', source, keyPath, temp, 'https://example.invalid/third-party');
		assert.deepEqual(fs.readFileSync(first.packagePath), original);
		fs.appendFileSync(path.join(source, 'backend/index.mjs'), '\n// Independently changed implementation.\n');
		assert.throws(
			() => run('build-release.mjs', source, keyPath, temp, 'https://example.invalid/third-party'),
			/Command failed/,
		);
		assert.deepEqual(fs.readFileSync(first.packagePath), original);
		manifest.version = '2.0.1';
		fs.writeFileSync(manifestPath, JSON.stringify(manifest));
		const second = JSON.parse(
			run('build-release.mjs', source, keyPath, temp, 'https://example.invalid/third-party'),
		);
		const catalogPath = path.join(temp, 'catalog.json');
		run('build-catalog-release.mjs', catalogPath, first.releasePath, second.releasePath);
		const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
		assert.equal(catalog.schemaVersion, 2);
		assert.equal(catalog.packages.length, 2);
		assert.equal(catalog.packages[0].sha256, sha256(original));
		assert.equal(
			catalog.packages[0].localizations,
			undefined,
			'Independent publishers keep their original catalog text',
		);
		assert.deepEqual(fs.readFileSync(first.packagePath), original);
		const tampered = JSON.parse(fs.readFileSync(second.releasePath, 'utf8'));
		tampered.package.compatibility.host.minVersion = '1.0.0';
		fs.writeFileSync(second.releasePath, JSON.stringify(tampered));
		assert.throws(
			() => run('build-catalog-release.mjs', path.join(temp, 'tampered.json'), second.releasePath),
			/Command failed/,
		);
		const wrongKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
		assert.throws(
			() => inspectArtifact(first.packagePath, wrongKey),
			/PLUGIN_FILE_LIST_INVALID|PLUGIN_SIGNATURE_INVALID/,
		);
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
});

function listPage(names, nextAfter = null) {
	return {
		status: 'ok',
		value: {
			entries: names.map((name) => ({ name, kind: 'file', size: 1, modifiedAt: 0 })),
			nextAfter,
			fingerprint: 'a'.repeat(64),
		},
	};
}

function textPage(input, text) {
	const bytes = Buffer.byteLength(text);
	return {
		status: 'ok',
		value: {
			path: input.path,
			text,
			bytes,
			sizeBytes: bytes,
			offset: 0,
			nextOffset: null,
			sha256: 'a'.repeat(64),
			pageSha256: 'a'.repeat(64),
			fingerprint: 'a'.repeat(64),
		},
	};
}

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

test('third-party frontend fences a storage write whose outcome is unknown', async () => {
	const elements = new Map();
	for (const name of [
		'fullstack-frontend-status',
		'fullstack-backend-status',
		'fullstack-write-storage',
		'fullstack-storage-result',
	]) {
		elements.set(`[data-testid="${name}"]`, {
			textContent: '',
			disabled: false,

			addEventListener(event, listener) {
				this[event] = listener;
			},
		});
	}
	const document = { querySelector: (selector) => elements.get(selector) };
	const sdk = {
		async request(input) {
			if (input.method === 'storage.put') {
				const failure = new Error('operation_unknown');
				failure.outcomeUnknown = true;
				throw failure;
			}
			return {
				method: input.method,
				value: input.method === 'host.appInfo' ? { appId: 'example.thirdparty', version: '2.0.0' } : null,
			};
		},

		async close() {},
	};
	const source = fs
		.readFileSync(path.join(root, 'templates/fullstack/frontend/app.mjs'), 'utf8')
		.replace("import { connectNexusPlugin } from '/sdk/frontend-v4.mjs';", '');
	const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
	const execute = new AsyncFunction('connectNexusPlugin', 'document', 'window', 'crypto', source);
	await execute(async () => sdk, document, { addEventListener() {} }, globalThis.crypto);
	const button = elements.get('[data-testid="fullstack-write-storage"]');
	await button.click();
	assert.equal(button.disabled, true);
	assert.match(elements.get('[data-testid="fullstack-storage-result"]').textContent, /operation_unknown/);
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

test('inspection App submits a target-bound form, reuses the real remote algorithm and renders its report', async () => {
	const nodes = new Map();

	const makeNode = () => ({
		value: '',
		textContent: '',
		disabled: false,
		children: [],

		append(child) {
			this.children.push(child);
		},

		replaceChildren() {
			this.children = [];
		},

		addEventListener(name, callback) {
			this[name] = callback;
		},
	});

	for (const id of [
		'inspection-form',
		'inspect',
		'status',
		'report',
		'approvals',
		'refresh',
		'model',
		'connection',
		'directory',
	]) {
		nodes.set(id, makeNode());
	}
	nodes.get('connection').value = '1';
	nodes.get('directory').value = '/project';
	nodes.get('model').value = '0';
	const calls = [];
	let reportText = '';
	const remote = await openPackageRuntime('nexus.tools.remote', async (input) =>
		input.operation === 'remote.listPage'
			? listPage(['package.json'])
			: textPage(input, JSON.stringify({ name: 'inspection-fixture', scripts: { check: 'tsc' } })),
	);
	const sdk = {
		async request(input) {
			readAgentPluginFrontendInput(input);
			calls.push(input);
			let value;
			if (input.method === 'agent.providers.list') {
				value = [
					{
						providerId: '11111111-1111-4111-8111-111111111111',
						providerDisplayName: 'Provider',
						modelId: 'model',
						configurationVersion: 1,
					},
				];
			} else if (input.method === 'agent.threads.create') {
				value = { id: '22222222-2222-4222-8222-222222222222' };
			} else if (input.method === 'agent.runs.create') {
				assert.deepEqual(input.params.input.connectionIds, [1]);
				assert.equal(input.params.input.approvalMode, 'ask');
				assert.match(input.params.input.prompt, /remote_project_inspect/);
				reportText = JSON.stringify(
					await remote.invoke('remote_project_inspect', { connectionId: 1, directory: '/project' }),
				);
				value = { run: { id: '33333333-3333-4333-8333-333333333333' } };
			} else if (input.method === 'agent.threads.entries') {
				value = {
					items: [{ role: 'assistant', text: reportText }],
					nextCursor: { runSequence: 1, messageOrdinal: 1, chunkIndex: 1, textOffset: reportText.length },
				};
			} else if (input.method === 'agent.runs.get') {
				value = { status: 'completed', failure: null };
			} else if (input.method === 'agent.approvals.list') {
				value = { items: [], hasMore: false, nextCursor: null };
			} else {
				throw new Error(`Unexpected SDK call: ${input.method}`);
			}
			return { method: input.method, value };
		},

		agent: {
			runs: {
				subscribe() {
					return { id: 'subscription' };
				},

				async unsubscribe() {},
			},
		},

		async close() {},
	};
	try {
		const source = fs
			.readFileSync(path.join(root, 'templates/project-inspection/frontend/app.mjs'), 'utf8')
			.replace("import { connectNexusPlugin } from '/sdk/frontend-v4.mjs';", '');
		const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
		await new AsyncFunction('connectNexusPlugin', 'document', 'window', 'crypto', source)(
			async () => sdk,
			{
				getElementById: (id) => nodes.get(id),

				createElement: makeNode,
			},
			{ addEventListener() {} },
			globalThis.crypto,
		);
		await nodes.get('inspection-form').submit({ preventDefault() {} });
		assert.equal(calls.filter((input) => input.method === 'agent.runs.create').length, 1);
		assert.match(nodes.get('report').textContent, /inspection-fixture/);
		assert.match(nodes.get('report').textContent, /recommendedChecks/);
		assert.equal(nodes.get('status').textContent, 'Inspection completed');
		assert.equal(nodes.get('inspect').disabled, false);
	} finally {
		await remote.close();
	}
});

test('development loopback package URLs require an explicit option and keep original signed archive bytes', () => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-loopback-release-'));
	try {
		const keys = generateKeyPairSync('ed25519');
		const keyPath = path.join(temp, 'key.pem');
		fs.writeFileSync(keyPath, keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
		const source = path.join(root, 'templates/fullstack');
		assert.throws(() => run('build-release.mjs', source, keyPath, temp, 'http://127.0.0.1:3003'), /Command failed/);
		const local = JSON.parse(
			run('build-release.mjs', source, keyPath, temp, 'http://127.0.0.1:3003', '--development-loopback-url'),
		);
		const release = JSON.parse(fs.readFileSync(local.releasePath, 'utf8'));
		assert.equal(release.package.packageUrl, `http://127.0.0.1:3003/${release.archiveName}`);
		const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
		assert.equal(inspectArtifact(local.packagePath, publicKey).sha256, release.package.sha256);
		assert.throws(
			() =>
				run(
					'build-release.mjs',
					source,
					keyPath,
					path.join(temp, 'nonlocal'),
					'http://example.invalid',
					'--development-loopback-url',
				),
			/Command failed/,
		);
	} finally {
		fs.rmSync(temp, { recursive: true, force: true });
	}
});

test('Official catalog metadata has valid locale translations for every published plugin', () => {
	const { readAgentPluginCatalogPackage } = sharedCatalogCodec;
	const translations = JSON.parse(fs.readFileSync(path.join(root, 'catalog/localizations.json'), 'utf8'));
	for (const directory of fs.readdirSync(path.join(root, 'plugins'))) {
		const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins', directory, 'manifest.json'), 'utf8'));
		const entry = readAgentPluginCatalogPackage({
			packageId: manifest.id,
			version: manifest.version,
			compatibility: manifest.compatibility,
			contributionKinds: ['tools'],
			displayName: manifest.displayName,
			description: 'Fallback',
			localizations: translations[manifest.id],
			packageUrl: 'https://example.test/package.tar',
			sha256: 'a'.repeat(64),
			sizeBytes: 1024,
			publisherKeyId: 'ed25519:' + 'b'.repeat(64),
		});
		assert.deepEqual(
			entry.localizations.map((item) => item.locale),
			['en-US', 'zh-CN', 'ja-JP'],
		);
		for (const item of entry.localizations) {
			assert.ok(item.displayName && item.description);
		}
	}
});
