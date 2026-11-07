#!/usr/bin/env node
import { createPrivateKey, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	readSourceManifest,
	publisherIdentity,
	visitFiles,
	signatureDomain,
	writeImmutable,
	inspectArtifact,
} from './lib/package-artifact.mjs';

const [sourceArg, outputArg, keyArg] = process.argv.slice(2);
if (!sourceArg || !outputArg || !keyArg) {
	throw new Error('Usage: node scripts/build-package.mjs <source-dir> <output.tar> <ed25519-private-key.pem>');
}
const source = path.resolve(sourceArg);
const output = path.resolve(outputArg);
const manifest = readSourceManifest(source);
const privateKey = createPrivateKey(fs.readFileSync(path.resolve(keyArg)));
const publisher = publisherIdentity(privateKey);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-agent-plugin-'));
try {
	const root = path.join(temp, 'package');
	fs.mkdirSync(root);
	for (const directory of ['frontend', 'backend', 'skills', 'docs']) {
		if (fs.existsSync(path.join(source, directory))) {
			fs.cpSync(path.join(source, directory), path.join(root, directory), {
				recursive: true,
				dereference: false,
			});
		}
	}
	const fileListBytes = Buffer.from(
		`${JSON.stringify({ schemaVersion: 1, publisherKeyId: publisher.keyId, files: visitFiles(root) }, null, 2)}\n`,
	);
	const manifestBytes = fs.readFileSync(path.join(source, 'manifest.json'));
	fs.writeFileSync(path.join(root, 'manifest.json'), manifestBytes);
	fs.writeFileSync(path.join(root, 'files.json'), fileListBytes);
	fs.writeFileSync(
		path.join(root, 'signature.ed25519'),
		sign(null, Buffer.concat([signatureDomain, manifestBytes, Buffer.from([0]), fileListBytes]), privateKey),
	);
	const candidate = path.join(temp, 'package.tar');
	execFileSync('tar', [
		'--sort=name',
		'--mtime=@0',
		'--owner=0',
		'--group=0',
		'--numeric-owner',
		'--format=ustar',
		'-cf',
		candidate,
		'-C',
		root,
		'.',
	]);
	const inspected = inspectArtifact(candidate, publisher.publicKeyPem);
	writeImmutable(output, fs.readFileSync(candidate));
	process.stdout.write(
		`${JSON.stringify({ packageId: manifest.id, version: manifest.version, manifest, publisherKeyId: publisher.keyId, publicKeyPem: publisher.publicKeyPem, sha256: inspected.sha256, sizeBytes: inspected.sizeBytes, output }, null, 2)}\n`,
	);
} finally {
	fs.rmSync(temp, { recursive: true, force: true });
}
