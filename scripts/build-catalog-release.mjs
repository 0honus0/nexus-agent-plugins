#!/usr/bin/env node
import path from 'node:path';
import { compare } from 'semver';
import { inspectComposition } from './lib/composition.mjs';
import { readReleaseArtifact, writeImmutable } from './lib/package-artifact.mjs';
import { readAgentPluginCatalogIndex } from '@nexus-terminal/shared/agent/plugins/repository-http-codec';

const [outputArg, ...inputArgs] = process.argv.slice(2);
const releaseArgs = [];
const requiredApps = [];
for (let index = 0; index < inputArgs.length; index++) {
	if (inputArgs[index] === '--require-app') {
		const packageId = inputArgs[++index];
		if (!packageId || packageId.startsWith('--')) {
			throw new Error('PLUGIN_CATALOG_APP_SELECTOR_INVALID');
		}
		requiredApps.push(packageId);
	} else {
		releaseArgs.push(inputArgs[index]);
	}
}
if (!outputArg || !releaseArgs.length) {
	throw new Error(
		'Usage: node scripts/build-catalog-release.mjs <catalog.json> <package.release.json>... [--require-app packageId]',
	);
}
const publishers = new Map();
const packages = new Map();
const candidates = [];
for (const releaseArg of releaseArgs) {
	const releasePath = path.resolve(releaseArg);
	const { release, manifest } = readReleaseArtifact(releasePath);
	const expected = release.package;
	const priorPublisher = publishers.get(release.publisher.keyId);
	if (
		priorPublisher &&
		(priorPublisher.publicKeyPem !== release.publisher.publicKeyPem ||
			priorPublisher.label !== release.publisher.label)
	) {
		throw new Error('PLUGIN_PUBLISHER_COLLISION');
	}
	publishers.set(release.publisher.keyId, release.publisher);
	const identity = `${expected.publisherKeyId}:${expected.packageId}:${expected.version}`;
	const prior = packages.get(identity);
	if (prior && (prior.sha256 !== expected.sha256 || prior.sizeBytes !== expected.sizeBytes)) {
		throw new Error('PLUGIN_RELEASE_IDENTITY_COLLISION');
	}
	if (!prior) {
		packages.set(identity, expected);
		candidates.push({ manifest, publisherKeyId: expected.publisherKeyId });
	}
}
const compositions = [];
for (const packageId of requiredApps) {
	const matching = candidates.filter((candidate) => candidate.manifest.id === packageId);
	if (new Set(matching.map((candidate) => candidate.publisherKeyId)).size !== 1) {
		throw new Error(`PLUGIN_CATALOG_APP_IDENTITY_UNRESOLVED:${packageId}`);
	}
	matching.sort((left, right) => compare(right.manifest.version, left.manifest.version));
	const selected = matching[0];
	const composition = inspectComposition(selected.manifest, candidates);
	if (composition.status !== 'complete') {
		throw new Error(`PLUGIN_CATALOG_APP_INCOMPLETE:${JSON.stringify(composition)}`);
	}
	compositions.push({ publisherKeyId: selected.publisherKeyId, ...composition });
}
const index = readAgentPluginCatalogIndex({
	schemaVersion: 2,
	publishers: [...publishers.values()],
	packages: [...packages.values()],
});
writeImmutable(path.resolve(outputArg), Buffer.from(`${JSON.stringify(index, null, 2)}\n`));
console.log(
	JSON.stringify(
		{
			catalogPath: path.resolve(outputArg),
			packages: index.packages.length,
			requiredAppCompositions: compositions,
		},
		null,
		2,
	),
);
