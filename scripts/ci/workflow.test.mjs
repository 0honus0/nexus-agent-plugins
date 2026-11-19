import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releasePlugin, selectPlugins } from './plugins.mjs';
import { addVersion, updateCatalog } from './publish.mjs';

function plugin(name, dependencies = [], privatePackage = false) {
	const scope = '@nexus-terminal/';
	return {
		name,
		manifest: {
			name: scope + name,
			version: '0.1.3',
			private: privatePackage,
			nexus: { dependsOn: Object.fromEntries(dependencies.map((dependency) => [scope + dependency, '^0.1.0'])) },
		},
	};
}

const plugins = new Map(
	[
		plugin('ssh'),
		plugin('credentials', ['ssh']),
		plugin('connections', ['credentials']),
		plugin('test', [], true),
	].map((entry) => [entry.manifest.name, entry]),
);

test('matches changed plugins and transitive dependents without unrelated test jobs', () => {
	assert.deepEqual(selectPlugins(plugins, ['plugins/ssh/src/node/index.ts']), ['connections', 'credentials', 'ssh']);
	assert.deepEqual(selectPlugins(plugins, ['plugins/test/tests/setup.ts']), ['test']);
	assert.deepEqual(selectPlugins(plugins, []), []);
});

test('shared files and removed plugin directories trigger the whole matrix', () => {
	const all = ['connections', 'credentials', 'ssh', 'test'];
	assert.deepEqual(selectPlugins(plugins, ['pnpm-lock.yaml']), all);
	assert.deepEqual(selectPlugins(plugins, ['plugins/removed/package.json']), all);
	assert.deepEqual(selectPlugins(plugins, [], true), all);
});

test('a version tag selects one public plugin with a matching version', () => {
	assert.equal(releasePlugin(plugins, 'ssh/v0.1.3').manifest.name, '@nexus-terminal/ssh');
	for (const tag of ['v0.1.3', 'ssh/v0.1.2', 'test/v0.1.3', '../v0.1.3', 'ssh/v0.1.3/extra'])
		assert.throws(() => releasePlugin(plugins, tag));
});

test('merges new versions without changing published versions or other entries', () => {
	const published = {
		package: { name: '@nexus-terminal/ssh', version: '0.1.3' },
		distributions: [{ tarball: 'https://example.test/ssh.tgz', integrity: 'sha512-original' }],
	};
	const nextSsh = { ...published, package: { ...published.package, version: '0.1.4' } };
	const oidc = { ...published, package: { name: '@nexus-terminal/oidc', version: '0.1.0' } };
	const before = addVersion([], published);
	const after = addVersion(addVersion(before, oidc), nextSsh);

	assert.deepEqual(
		after.map(({ versions }) => versions),
		[[published, nextSsh], [oidc]],
	);
	assert.deepEqual(before[0].versions, [published]);
	assert.equal(addVersion(after, structuredClone(published)), after);
	assert.throws(() => addVersion(after, { ...published, distributions: [] }), /already exists/u);
});

test('retries a catalog write conflict against the other release’s version', async (context) => {
	const ssh = { package: { name: '@nexus-terminal/ssh', version: '0.1.3' }, distributions: [] };
	const oidc = { package: { name: '@nexus-terminal/oidc', version: '0.1.0' }, distributions: [] };

	const content = (catalog, sha) =>
		Response.json({ sha, content: Buffer.from(JSON.stringify(catalog)).toString('base64') });

	const catalog = addVersion([], oidc);
	const fetch = context.mock.method(globalThis, 'fetch', (_url, request) => {
		switch (fetch.mock.callCount()) {
			case 0:
				return Response.json({ ref: 'refs/heads/catalog' });
			case 1:
				return content([], 'before');
			case 2:
				assert.equal(request.method, 'PUT');
				assert.equal(JSON.parse(request.body).sha, 'before');
				return new Response(null, { status: 409 });
			case 3:
				return content(catalog, 'after');
			case 4: {
				const update = JSON.parse(request.body);
				assert.equal(update.sha, 'after');
				assert.deepEqual(JSON.parse(Buffer.from(update.content, 'base64')), addVersion(catalog, ssh));
				return new Response(null, { status: 200 });
			}
			default:
				assert.fail('unexpected catalog request');
		}
	});
	await updateCatalog(ssh, { GH_REPO: 'test/repository', GH_TOKEN: 'test-token' });
	assert.equal(fetch.mock.callCount(), 5);
});
