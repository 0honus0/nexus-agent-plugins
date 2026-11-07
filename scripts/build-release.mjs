#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceManifest, catalogEntry, writeImmutable } from './lib/package-artifact.mjs';

const [sourceArg, keyArg, outputArg, baseUrlArg, developmentArg] = process.argv.slice(2);
if (developmentArg !== undefined && developmentArg !== '--development-loopback-url') {
	throw new Error('PLUGIN_RELEASE_DEVELOPMENT_OPTION_INVALID');
}
if (!sourceArg || !keyArg || !outputArg || !baseUrlArg) {
	throw new Error(
		'Usage: node scripts/build-release.mjs <plugin-source> <private-key.pem> <output-dir> <release-base-url> [--development-loopback-url]',
	);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
const manifest = readSourceManifest(source);
const packageName = `${manifest.id}-${manifest.version}.tar`;
const packagePath = path.join(output, packageName);
const metadata = JSON.parse(
	execFileSync(
		process.execPath,
		[path.join(root, 'scripts/build-package.mjs'), source, packagePath, path.resolve(keyArg)],
		{ encoding: 'utf8' },
	),
);
const baseUrl = new URL(baseUrlArg.endsWith('/') ? baseUrlArg : `${baseUrlArg}/`);
const official = JSON.parse(fs.readFileSync(path.join(root, 'catalog/official-publisher.json'), 'utf8'));
const developmentLoopback =
	developmentArg === '--development-loopback-url' &&
	metadata.publisherKeyId !== official.keyId &&
	baseUrl.protocol === 'http:' &&
	['127.0.0.1', '[::1]', 'localhost'].includes(baseUrl.hostname);
if (baseUrl.protocol !== 'https:' && !developmentLoopback) {
	throw new Error('PLUGIN_RELEASE_URL_INVALID');
}
if (baseUrl.username || baseUrl.password || baseUrl.hash) {
	throw new Error('PLUGIN_RELEASE_URL_INVALID');
}
const publisherLabel = metadata.publisherKeyId === official.keyId ? official.label : metadata.publisherKeyId;
const release = {
	schemaVersion: 2,
	publisher: { keyId: metadata.publisherKeyId, label: publisherLabel, publicKeyPem: metadata.publicKeyPem },
	package: catalogEntry(
		manifest,
		metadata.publisherKeyId,
		metadata.sha256,
		metadata.sizeBytes,
		new URL(packageName, baseUrl).href,
	),
	archiveName: packageName,
};
const releasePath = path.join(output, `${manifest.id}-${manifest.version}.release.json`);
writeImmutable(releasePath, Buffer.from(`${JSON.stringify(release, null, 2)}\n`));
console.log(JSON.stringify({ packagePath, releasePath, sha256: metadata.sha256 }, null, 2));
