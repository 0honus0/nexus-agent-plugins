import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectComposition } from '../../scripts/lib/composition.mjs';

const publisherKeyId = JSON.parse(
	fs.readFileSync(new URL('../../catalog/official-publisher.json', import.meta.url), 'utf8'),
).keyId;

const read = (id) => JSON.parse(fs.readFileSync(new URL(`../../plugins/${id}/manifest.json`, import.meta.url), 'utf8'));

function fixture() {
	const manifest = read('nexus.agent');
	manifest.dependencies = [
		{ packageId: 'nexus.tools.remote', publisherKeyId, minVersion: '2.0.0', maxVersion: '2.0.1' },
	];
	const candidates = [{ manifest: read('nexus.tools.remote'), publisherKeyId }];
	return { manifest, candidates };
}

test('a tool beyond an unchanged App range remains independently releasable with explicit incomplete source composition', () => {
	const { manifest, candidates } = fixture();
	candidates.find((candidate) => candidate.manifest.id === 'nexus.tools.remote').manifest.version = '2.0.2';
	const result = inspectComposition(manifest, candidates);
	assert.equal(result.status, 'incomplete');
	assert.deepEqual(
		result.unselected.map((dependency) => dependency.packageId),
		['nexus.tools.remote'],
	);
	assert.equal(result.unselected[0].status, 'unselected');
	assert.equal(
		result.selected.some((dependency) => dependency.packageId === 'nexus.tools.remote'),
		false,
	);
});

test('an old App selects the retained highest compatible archive while newer tool versions remain in the catalog', () => {
	const { manifest, candidates } = fixture();
	const remote = candidates.find((candidate) => candidate.manifest.id === 'nexus.tools.remote');
	for (const version of ['2.0.1', '2.0.2']) {
		const next = structuredClone(remote);
		next.manifest.version = version;
		candidates.push(next);
	}
	const result = inspectComposition(manifest, candidates);
	assert.equal(result.status, 'complete');
	assert.equal(result.selected.find((dependency) => dependency.packageId === 'nexus.tools.remote').version, '2.0.1');
	manifest.version = '2.1.0';
	manifest.dependencies.find((dependency) => dependency.packageId === 'nexus.tools.remote').maxVersion = '2.0.2';
	const updated = inspectComposition(manifest, candidates);
	assert.equal(updated.status, 'complete');
	assert.equal(updated.selected.find((dependency) => dependency.packageId === 'nexus.tools.remote').version, '2.0.2');
});

test('a matching version from another publisher never fills a required dependency', () => {
	const { manifest, candidates } = fixture();
	candidates[0].publisherKeyId = `ed25519:${'0'.repeat(64)}`;
	const result = inspectComposition(manifest, candidates);
	assert.equal(result.status, 'incomplete');
	assert.equal(result.unselected[0].publisherKeyId, publisherKeyId);
});

test('Apps own their execution entry and optional tools or UI are not signed code dependencies', () => {
	const manifest = read('nexus.agent');
	assert.deepEqual(manifest.dependencies, []);
	const result = inspectComposition(manifest, []);
	assert.equal(result.status, 'complete');
	assert.deepEqual(result.selected, []);
	assert.deepEqual(result.requiredUi, { contract: 'nexus.ui.chat', apiVersion: 1 });
});

test('transitive code dependencies are publisher-bound and cycles are refused', () => {
	const { manifest, candidates } = fixture();
	const remote = candidates[0].manifest;
	remote.dependencies = [
		{
			packageId: 'nexus.tools.agent',
			publisherKeyId,
			minVersion: read('nexus.tools.agent').version,
			maxVersion: read('nexus.tools.agent').version,
		},
	];
	assert.equal(inspectComposition(manifest, candidates).status, 'incomplete');
	const agent = read('nexus.tools.agent');
	candidates.push({ manifest: agent, publisherKeyId });
	assert.equal(inspectComposition(manifest, candidates).status, 'complete');
	agent.dependencies = [structuredClone(manifest.dependencies[0])];
	assert.throws(() => inspectComposition(manifest, candidates), /DEPENDENCY_CYCLE/);
});

test('an App retains the compatible tool when a newer in-range archive requires another Host', () => {
	const { manifest, candidates } = fixture();
	const remote = structuredClone(candidates.find((candidate) => candidate.manifest.id === 'nexus.tools.remote'));
	remote.manifest.version = '2.0.1';
	remote.manifest.compatibility.host = { minVersion: '1.2.0', maxVersion: '1.2.0' };
	candidates.push(remote);
	const result = inspectComposition(manifest, candidates);
	assert.equal(result.status, 'complete');
	assert.equal(result.selected.find((dependency) => dependency.packageId === 'nexus.tools.remote').version, '2.0.0');
});
