import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { visitFiles } from '../../../scripts/lib/package-artifact.mjs';

const pluginRoot = resolve(import.meta.dirname, '../../..');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function sourceIdentity(root) {
	const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

	const files = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0'))]
		.filter(Boolean)
		.sort();
	const hashes = [];
	for (const path of files) {
		try {
			hashes.push({ path, sha256: sha256(await readFile(join(root, path))) });
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error;
			}
			hashes.push({ path, deleted: true });
		}
	}
	return { commit: git('rev-parse', 'HEAD').trim(), filesSha256: sha256(JSON.stringify(hashes)) };
}

/** Candidates are exact output archives; Host performs its normal signature/package validation. */
export async function loadCandidateHost() {
	assert.ok(process.env.NEXUS_TEST_HOST_ROOT, 'NEXUS_TEST_HOST_ROOT must identify a built Host test artifact');
	assert.ok(process.env.NEXUS_TEST_PLUGIN_SET, 'NEXUS_TEST_PLUGIN_SET must identify one staging generation');
	assert.ok(process.env.NEXUS_TEST_ARTIFACT_DIR, 'NEXUS_TEST_ARTIFACT_DIR must identify this run evidence');
	const hostRoot = resolve(process.env.NEXUS_TEST_HOST_ROOT);
	const candidateRoot = resolve(process.env.NEXUS_TEST_PLUGIN_SET);
	const artifactRoot = resolve(process.env.NEXUS_TEST_ARTIFACT_DIR);
	await mkdir(artifactRoot, { recursive: true });
	const origin = JSON.parse(await readFile(join(candidateRoot, 'validation-origin.json'), 'utf8'));
	const catalog = JSON.parse(await readFile(join(candidateRoot, 'catalog.json'), 'utf8'));
	assert.equal(origin.official, false, 'Host candidates must use a development signing key');
	const packages = [];
	for (const source of origin.sourceVersions) {
		const version = `${source.version}-dev.${origin.stagingGeneration}`;
		const entry = catalog.packages.find((item) => item.packageId === source.packageId && item.version === version);
		assert.ok(entry, 'Missing exact candidate: ' + source.packageId);
		assert.equal(entry.publisherKeyId, origin.publisherKeyId);
		const publisher = catalog.publishers.find((item) => item.keyId === entry.publisherKeyId);
		assert.ok(publisher);
		const bytes = await readFile(join(candidateRoot, `${entry.packageId}-${version}.tar`));
		assert.equal(bytes.length, entry.sizeBytes);
		assert.equal(sha256(bytes), entry.sha256);
		packages.push({
			bytes,
			metadata: {
				packageId: entry.packageId,
				version,
				compatibility: entry.compatibility,
				contributionKinds: entry.contributionKinds,
				displayName: entry.displayName,
				publisherKeyId: entry.publisherKeyId,
				publicKeyPem: publisher.publicKeyPem,
				sha256: entry.sha256,
				sizeBytes: entry.sizeBytes,
			},
		});
	}
	const harness = await import(pathToFileURL(join(hostRoot, 'tests/support/plugins/host-harness.mjs')).href);
	assert.equal(harness.HOST_HARNESS_API_VERSION, 1, 'Unsupported Host test artifact API');
	return {
		openAgentHost: harness.openAgentHost,
		openImageHost: harness.openImageHost,
		waitForHost: harness.waitForHost,
		packages,
		artifactRoot,
		combination: {
			host: {
				...(await sourceIdentity(hostRoot)),
				builds: ['packages/backend/dist', 'packages/shared/dist'].map((directory) => ({
					directory,
					filesSha256: sha256(JSON.stringify(visitFiles(join(hostRoot, directory)))),
				})),
			},
			plugins: await sourceIdentity(pluginRoot),
			sdk: await Promise.all(
				['backend-v4.mjs', 'frontend-v4.mjs', 'nexus-terminal-shared-4.0.4.tgz'].map(async (file) => ({
					file,
					sha256: sha256(await readFile(join(pluginRoot, 'sdk', file))),
				})),
			),
			packages: packages.map(({ metadata }) => ({
				packageId: metadata.packageId,
				version: metadata.version,
				publisherKeyId: metadata.publisherKeyId,
				sha256: metadata.sha256,
				sizeBytes: metadata.sizeBytes,
			})),
			stagingOrigin: origin,
		},
	};
}
