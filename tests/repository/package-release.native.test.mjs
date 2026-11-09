import assert from 'node:assert/strict';
import * as sharedCatalogCodec from '@nexus-terminal/shared/agent/plugins/repository-http-codec';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectArtifact, sha256 } from '../../scripts/lib/package-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
		manifest.requiredOnEnable = true;
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
		assert.ok(catalog.packages.every((entry) => entry.requiredOnEnable === true));
		assert.equal(catalog.packages[0].sha256, sha256(original));
		assert.equal(
			catalog.packages[0].localizations,
			undefined,
			'Independent publishers keep their original catalog text',
		);
		assert.deepEqual(fs.readFileSync(first.packagePath), original);
		const localized = JSON.parse(fs.readFileSync(first.releasePath, 'utf8'));
		localized.package.description = 'Editable catalog description';
		localized.package.localizations = [
			{ locale: 'zh-CN', displayName: '第三方插件', description: '独立发布者的说明' },
		];
		const inheritedPath = path.join(temp, 'inherited.release.json');
		fs.writeFileSync(inheritedPath, JSON.stringify(localized));
		for (let generation = 0; generation < 2; generation++) {
			const aggregatedPath = path.join(temp, `localized-${generation}.json`);
			run('build-catalog-release.mjs', aggregatedPath, inheritedPath);
			const aggregated = JSON.parse(fs.readFileSync(aggregatedPath, 'utf8')).packages[0];
			assert.equal(aggregated.sha256, sha256(original));
			assert.equal(aggregated.description, localized.package.description);
			assert.deepEqual(aggregated.localizations, localized.package.localizations);
			fs.writeFileSync(
				inheritedPath,
				JSON.stringify({
					schemaVersion: localized.schemaVersion,
					publisher: localized.publisher,
					package: aggregated,
					archiveName: localized.archiveName,
				}),
			);
		}
		const requirementTampered = JSON.parse(fs.readFileSync(second.releasePath, 'utf8'));
		const originalDescriptor = fs.readFileSync(second.releasePath);
		requirementTampered.package.requiredOnEnable = false;
		fs.writeFileSync(second.releasePath, JSON.stringify(requirementTampered));
		assert.throws(
			() => run('build-catalog-release.mjs', path.join(temp, 'wrong-requirement.json'), second.releasePath),
			/Command failed/,
		);
		fs.writeFileSync(second.releasePath, originalDescriptor);
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
