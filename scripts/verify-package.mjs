#!/usr/bin/env node
import fs from 'node:fs';
import { inspectArtifact } from './lib/package-artifact.mjs';

const [archivePath, publicKeyPath] = process.argv.slice(2);
if (!archivePath || !publicKeyPath) {
	throw new Error('Usage: node scripts/verify-package.mjs <package.tar> <ed25519-public-key.pem>');
}
console.log(JSON.stringify(inspectArtifact(archivePath, fs.readFileSync(publicKeyPath, 'utf8')), null, 2));
