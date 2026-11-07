#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readSourceManifest, publisherIdentity } from './lib/package-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directories = process.argv.slice(2);
const sources = directories.length
	? directories.map((directory) => path.resolve(directory))
	: ['plugins', 'templates'].flatMap((directory) =>
			fs
				.readdirSync(path.join(root, directory), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => path.join(root, directory, entry.name)),
		);
const ids = new Set();
for (const source of sources) {
	if (path.dirname(source) === path.join(root, 'plugins')) {
		const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
		if (typeof metadata.scripts?.test !== 'string' || !metadata.scripts.test.trim()) {
			throw new Error(`PLUGIN_TEST_ENTRY_REQUIRED:${path.basename(source)}`);
		}
	}
	const manifest = readSourceManifest(source);
	if (ids.has(manifest.id)) {
		throw new Error(`PLUGIN_ID_COLLISION:${manifest.id}`);
	}
	ids.add(manifest.id);
	for (const skill of manifest.contributions.skills) {
		const content = fs.readFileSync(path.join(source, skill.path), 'utf8');
		const slug = path.basename(path.dirname(skill.path));
		if (
			!content.startsWith('---\n') ||
			!content.includes(`\nname: ${slug}\n`) ||
			!/^description: .+/m.test(content)
		) {
			throw new Error(`PLUGIN_SKILL_INVALID:${skill.id}`);
		}
	}
}
const publisher = JSON.parse(fs.readFileSync(path.join(root, 'catalog/official-publisher.json'), 'utf8'));
if (publisherIdentity(createPublicKey(publisher.publicKeyPem)).keyId !== publisher.keyId) {
	throw new Error('OFFICIAL_PLUGIN_PUBLISHER_INVALID');
}
console.log(`Plugin repository check passed: ${ids.size} package(s), shared manifest v4 contract.`);
