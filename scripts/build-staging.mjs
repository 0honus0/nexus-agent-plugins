#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSourceManifest, publisherIdentity, writeImmutable, sha256 } from './lib/package-artifact.mjs';

const [outputArg, keyArg, ...options] = process.argv.slice(2);
let includeInspection = false;
let baseUrl = null;
for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
	if (options[optionIndex] === '--include-inspection') {
		includeInspection = true;
	} else if (options[optionIndex] === '--base-url' && options[optionIndex + 1]) {
		baseUrl = new URL(options[++optionIndex]);
	} else {
		throw new Error('PLUGIN_STAGING_OPTION_INVALID');
	}
}
if (!outputArg || !keyArg) {
	throw new Error(
		'Usage: node scripts/build-staging.mjs <artifacts-dir> <development-private-key.pem> [--include-inspection]',
	);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.resolve(outputArg);
fs.mkdirSync(outputRoot, { recursive: true });
const keyPath = path.resolve(keyArg);
const publisher = publisherIdentity(createPrivateKey(fs.readFileSync(keyPath)));
const official = JSON.parse(fs.readFileSync(path.join(root, 'catalog/official-publisher.json'), 'utf8'));
if (publisher.keyId === official.keyId) {
	throw new Error('PLUGIN_STAGING_REQUIRES_DEVELOPMENT_KEY');
}
execFileSync(process.execPath, [path.join(root, 'scripts/check-composition.mjs')], { stdio: 'inherit' });
let index = 1;
for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
	if (!entry.isDirectory() || !/^staging-\d+$/u.test(entry.name)) {
		continue;
	}
	for (const filename of fs.readdirSync(path.join(outputRoot, entry.name))) {
		const match = /-dev\.(\d+)\.(?:tar|release\.json)$/u.exec(filename);
		if (match !== null) {
			index = Math.max(index, Number(match[1]) + 1);
		}
	}
}
let output;
while (true) {
	output = path.join(outputRoot, `staging-${index}`);
	try {
		fs.mkdirSync(output, { recursive: false });
		break;
	} catch (error) {
		if (error?.code !== 'EEXIST') {
			throw error;
		}
		index++;
	}
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-plugin-staging-'));
try {
	const sourceRoot = path.join(root, 'plugins');
	const sourceDirectories = fs
		.readdirSync(sourceRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(sourceRoot, entry.name));
	if (includeInspection) {
		sourceDirectories.push(path.join(root, 'templates/project-inspection'));
	}
	const manifests = sourceDirectories.map((source) => ({ source, manifest: readSourceManifest(source) }));
	const sourceVersions = manifests.map(({ source, manifest }) => ({
		packageId: manifest.id,
		version: manifest.version,
		manifestSha256: sha256(fs.readFileSync(path.join(source, 'manifest.json'))),
	}));
	const versions = new Map(manifests.map(({ manifest }) => [manifest.id, `${manifest.version}-dev.${index}`]));
	const patchVersions = new Map(
		manifests
			.filter(({ manifest }) => manifest.contributions.app === null)
			.map(({ manifest }) => {
				const [major, minor, patch] = manifest.version.split('.').map(Number);
				return [manifest.id, `${major}.${minor}.${patch + 1}-dev.${index}`];
			}),
	);
	const descriptors = [];
	const variants = manifests.flatMap((entry) => [
		{ ...entry, version: versions.get(entry.manifest.id) },
		...(patchVersions.has(entry.manifest.id) ? [{ ...entry, version: patchVersions.get(entry.manifest.id) }] : []),
	]);
	for (const { source, manifest: original, version } of variants) {
		const manifest = structuredClone(original);
		const directory = path.join(temporary, `${manifest.id}-${version}`);
		fs.mkdirSync(directory);
		for (const runtime of ['frontend', 'backend', 'skills', 'docs']) {
			if (fs.existsSync(path.join(source, runtime))) {
				fs.cpSync(path.join(source, runtime), path.join(directory, runtime), { recursive: true });
			}
		}
		manifest.version = version;
		{
			for (const dependency of manifest.dependencies) {
				const selected = versions.get(dependency.packageId);
				if (!selected) {
					throw new Error('PLUGIN_STAGING_DEPENDENCY_MISSING');
				}
				dependency.publisherKeyId = publisher.keyId;
				dependency.minVersion = selected;
				dependency.maxVersion = patchVersions.get(dependency.packageId) ?? selected;
			}
		}
		fs.writeFileSync(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
		const result = JSON.parse(
			execFileSync(
				process.execPath,
				[
					path.join(root, 'scripts/build-release.mjs'),
					directory,
					keyPath,
					output,
					baseUrl?.href ?? `https://example.invalid/nexus-agent-validation/staging-${index}`,
					...(baseUrl?.protocol === 'http:' ? ['--development-loopback-url'] : []),
				],
				{ encoding: 'utf8' },
			),
		);
		descriptors.push(result.releasePath);
	}
	execFileSync(
		process.execPath,
		[
			path.join(root, 'scripts/build-catalog-release.mjs'),
			path.join(output, 'catalog.json'),
			...descriptors,
			...manifests
				.filter(({ manifest }) => manifest.contributions.app !== null)
				.flatMap(({ manifest }) => ['--require-app', manifest.id]),
		],
		{ stdio: 'inherit' },
	);
	writeImmutable(
		path.join(output, 'validation-origin.json'),
		Buffer.from(
			`${JSON.stringify(
				{
					publisherKeyId: publisher.keyId,
					official: false,
					stagingGeneration: index,
					sourceVersions,
					stagingVersions: variants.map(({ manifest, version }) => ({ packageId: manifest.id, version })),
					independentUpdate:
						'One unchanged App archive supports both the base and patch tool/UI archives; replace either dependency independently on the fixed Host.',
					note: 'Development-signed local fixtures; dependency keys and staging versions differ from production source. No publication.',
				},
				null,
				2,
			)}\n`,
		),
	);
	console.log(JSON.stringify({ output, publisherKeyId: publisher.keyId }, null, 2));
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}
