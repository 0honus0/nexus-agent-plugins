#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [sourceArg, keyArg, outputArg, baseUrlArg] = process.argv.slice(2);
if (!sourceArg || !keyArg || !outputArg || !baseUrlArg) {
  console.error('Usage: node scripts/build-release.mjs <plugin-source> <ed25519-private-key.pem> <output-dir> <release-base-url>');
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
fs.mkdirSync(output, { recursive: true });
const packageName = `${manifest.id}-${manifest.version}.tar`;
const packagePath = path.join(output, packageName);
const metadata = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/build-package.mjs'), source, packagePath, path.resolve(keyArg)], { encoding: 'utf8' }));
const baseUrl = baseUrlArg.replace(/\/$/, '');
const catalog = {
  schemaVersion: 1,
  publishers: [{ keyId: metadata.publisherKeyId, label: 'Nexus first-party plugins', publicKeyPem: metadata.publicKeyPem }],
  packages: [{
    appId: metadata.appId,
    version: metadata.version,
    sdkVersion: metadata.sdkVersion,
    nexus: metadata.nexus,
    displayName: metadata.displayName,
    description:
      manifest.agents?.[0]?.description ?? `First-party Nexus plugin: ${metadata.displayName}.`,
    packageUrl: `${baseUrl}/${packageName}`,
    sha256: metadata.sha256,
    sizeBytes: metadata.sizeBytes,
    publisherKeyId: metadata.publisherKeyId,
  }],
};
fs.writeFileSync(path.join(output, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ packagePath, catalogPath: path.join(output, 'catalog.json'), ...metadata }, null, 2)}\n`);
