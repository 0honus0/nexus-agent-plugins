#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { valid as validVersion } from 'semver';
import { sha256, visitFiles, writeImmutable } from './lib/package-artifact.mjs';

const [compiledPackageArg, licenseArg, ...options] = process.argv.slice(2);
const publicDependencyArgs = [];
let candidateVersion = null;
for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
	if (options[optionIndex] === '--candidate-version') {
		const version = options[++optionIndex];
		if (candidateVersion !== null || typeof version !== 'string' || validVersion(version) !== version) {
			throw new Error('SDK_CANDIDATE_VERSION_INVALID');
		}
		candidateVersion = version;
	} else {
		publicDependencyArgs.push(options[optionIndex]);
	}
}
if (!compiledPackageArg || !licenseArg) {
	throw new Error(
		'Usage: node scripts/export-sdk.mjs <built-public-sdk-package> <license> [--candidate-version sourceVersion-prerelease] [public-dependency-package]...',
	);
}
const source = path.resolve(compiledPackageArg);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDependencies = new Map();
for (const dependency of publicDependencyArgs) {
	const metadata = JSON.parse(fs.readFileSync(path.join(path.resolve(dependency), 'package.json'), 'utf8'));
	if (typeof metadata.name !== 'string' || validVersion(metadata.version) !== metadata.version) {
		throw new Error('SDK_PUBLIC_DEPENDENCY_METADATA_INVALID');
	}
	if (publicDependencies.has(metadata.name)) {
		throw new Error('SDK_PUBLIC_DEPENDENCY_COLLISION');
	}
	publicDependencies.set(metadata.name, metadata.version);
}

function publicDependencyVersions(dependencies) {
	const result = {};
	for (const [name, version] of Object.entries(dependencies ?? {})) {
		if (typeof version !== 'string') {
			throw new Error('SDK_PUBLIC_DEPENDENCY_INVALID');
		}
		if (/^(?:workspace:|file:|link:|\.)/u.test(version) || path.isAbsolute(version)) {
			const publishedVersion = publicDependencies.get(name);
			if (publishedVersion === undefined) {
				throw new Error(`SDK_PUBLIC_DEPENDENCY_METADATA_REQUIRED:${name}`);
			}
			result[name] = publishedVersion;
		} else {
			result[name] = version;
		}
	}
	return result;
}

const stagingRoot = path.join(root, '.task-artifacts', 'sdk-export');
fs.mkdirSync(stagingRoot, { recursive: true });
const temporary = fs.mkdtempSync(path.join(stagingRoot, 'shared-'));
try {
	const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
	if (candidateVersion !== null && !candidateVersion.startsWith(`${manifest.version}-`)) {
		throw new Error('SDK_CANDIDATE_SOURCE_VERSION_MISMATCH');
	}
	const version = candidateVersion ?? manifest.version;
	const distribution = {
		name: manifest.name,
		version,
		private: true,
		type: manifest.type,
		files: ['dist', 'LICENSE'],
		exports: manifest.exports,
		dependencies: publicDependencyVersions(manifest.dependencies),
	};
	fs.writeFileSync(path.join(temporary, 'package.json'), `${JSON.stringify(distribution, null, 2)}\n`);
	fs.cpSync(path.join(source, 'dist'), path.join(temporary, 'dist'), { recursive: true });
	fs.copyFileSync(path.resolve(licenseArg), path.join(temporary, 'LICENSE'));
	const output = path.join(root, 'sdk');
	fs.mkdirSync(output, { recursive: true });
	const packed = path.join(temporary, 'packed');
	fs.mkdirSync(packed);
	execFileSync('pnpm', ['pack', '--pack-destination', packed], { cwd: temporary, stdio: 'ignore' });
	const archiveName = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
	const archivePath = path.join(output, archiveName);
	writeImmutable(archivePath, fs.readFileSync(path.join(packed, archiveName)));
	const origin = {
		package: manifest.name,
		version,
		archive: archiveName,
		sha256: sha256(fs.readFileSync(archivePath)),
		sourceOwner: `nexus-terminal/packages/${path.basename(source)}`,
		sourceFilesSha256: sha256(Buffer.from(JSON.stringify(visitFiles(path.join(source, 'src'))))),
		compiledFilesSha256: sha256(Buffer.from(JSON.stringify(visitFiles(path.join(source, 'dist'))))),
	};
	if (candidateVersion !== null) {
		origin.sourceVersion = manifest.version;
		origin.candidate = true;
	}
	writeImmutable(
		path.join(output, archiveName.replace(/\.tgz$/u, '.origin.json')),
		Buffer.from(`${JSON.stringify(origin, null, 2)}\n`),
	);
	console.log(JSON.stringify({ archivePath }, null, 2));
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}
