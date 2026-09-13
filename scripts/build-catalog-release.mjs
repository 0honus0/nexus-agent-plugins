#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [keyArg, outputArg, baseUrlArg] = process.argv.slice(2);
if (!keyArg || !outputArg || !baseUrlArg) {
  console.error(
    'Usage: node scripts/build-catalog-release.mjs <ed25519-private-key.pem> <output-dir> <release-base-url>',
  );
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginsRoot = path.join(root, 'plugins');
const output = path.resolve(outputArg);
const key = path.resolve(keyArg);
const baseUrl = baseUrlArg.replace(/\/$/, '');
const officialPublisher = JSON.parse(
  fs.readFileSync(path.join(root, 'catalog', 'official-publisher.json'), 'utf8'),
);

fs.mkdirSync(output, { recursive: true });
const packages = [];
let observedPublicKeyPem = null;

for (const entry of fs
  .readdirSync(pluginsRoot, { withFileTypes: true })
  .filter((candidate) => candidate.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name))) {
  const source = path.join(pluginsRoot, entry.name);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  const packageName = `${manifest.id}-${manifest.version}.tar`;
  const packagePath = path.join(output, packageName);
  const metadata = JSON.parse(
    execFileSync(process.execPath, [path.join(root, 'scripts', 'build-package.mjs'), source, packagePath, key], {
      encoding: 'utf8',
    }),
  );
  if (
    metadata.publisherKeyId !== officialPublisher.keyId ||
    metadata.publicKeyPem.trim() !== officialPublisher.publicKeyPem.trim()
  ) {
    throw new Error('OFFICIAL_PLUGIN_SIGNING_KEY_MISMATCH');
  }
  observedPublicKeyPem ??= metadata.publicKeyPem;
  packages.push({
    appId: metadata.appId,
    version: metadata.version,
    displayName: metadata.displayName,
    description:
      manifest.agents?.[0]?.description ?? `First-party Nexus Agent plugin: ${metadata.displayName}.`,
    packageUrl: `${baseUrl}/${packageName}`,
    sha256: metadata.sha256,
    sizeBytes: metadata.sizeBytes,
    publisherKeyId: metadata.publisherKeyId,
  });
}

if (!packages.length || !observedPublicKeyPem) throw new Error('OFFICIAL_PLUGIN_CATALOG_EMPTY');
const catalog = {
  schemaVersion: 1,
  publishers: [officialPublisher],
  packages,
};
const catalogPath = path.join(output, 'catalog.json');
fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ catalogPath, publisherKeyId: officialPublisher.keyId, packages }, null, 2)}\n`,
);
