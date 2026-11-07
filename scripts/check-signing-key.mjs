#!/usr/bin/env node
import fs from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import path from 'node:path';
import { publisherIdentity } from './lib/package-artifact.mjs';

const [keyPath] = process.argv.slice(2);
if (!keyPath) {
	throw new Error('Usage: node scripts/check-signing-key.mjs <private-key.pem>');
}
const expected = JSON.parse(fs.readFileSync(new URL('../catalog/official-publisher.json', import.meta.url), 'utf8'));
const actual = publisherIdentity(createPrivateKey(fs.readFileSync(path.resolve(keyPath))));
if (actual.keyId !== expected.keyId || actual.publicKeyPem.trim() !== expected.publicKeyPem.trim()) {
	throw new Error('OFFICIAL_PLUGIN_SIGNING_KEY_MISMATCH');
}
console.log('Official publisher identity verified.');
