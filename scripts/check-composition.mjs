#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectComposition } from './lib/composition.mjs';
import { readManifestFile } from './lib/package-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publisher = JSON.parse(fs.readFileSync(path.join(root, 'catalog/official-publisher.json'), 'utf8'));
const manifests = new Map(
	fs
		.readdirSync(path.join(root, 'plugins'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const manifest = readManifestFile(path.join(root, 'plugins', entry.name));
			return [manifest.id, manifest];
		}),
);
const templates = fs
	.readdirSync(path.join(root, 'templates'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => readManifestFile(path.join(root, 'templates', entry.name)));
const candidates = [...manifests.values()].map((manifest) => ({ manifest, publisherKeyId: publisher.keyId }));
const compositions = [...manifests.values(), ...templates]
	.filter((manifest) => manifest.contributions.app !== null)
	.map((manifest) => inspectComposition(manifest, candidates));
console.log(
	JSON.stringify(
		{
			scope: 'current-source-only',
			productPackages: manifests.size,
			templates: templates.length,
			status: compositions.every((composition) => composition.status === 'complete') ? 'complete' : 'incomplete',
			compositions,
		},
		null,
		2,
	),
);
