#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
	AGENT_PLUGIN_MAX_CATALOG_BYTES,
	AGENT_PLUGIN_MAX_ARCHIVE_BYTES,
} from '@nexus-terminal/shared/agent/plugins/values';
import { writeImmutable, readReleaseDescriptor } from './lib/package-artifact.mjs';
import { readAgentPluginCatalogIndex } from '@nexus-terminal/shared/agent/plugins/repository-http-codec';

async function readBytes(response, limit) {
	if (response.body === null) {
		throw new Error('PLUGIN_RELEASE_DOWNLOAD_FAILED');
	}
	const chunks = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.byteLength;
		if (size > limit) {
			throw new Error('PLUGIN_RELEASE_DOWNLOAD_TOO_LARGE');
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size);
}

async function download(url, limit) {
	const source = new URL(url);
	if (source.protocol !== 'https:') {
		throw new Error('PLUGIN_RELEASE_URL_INVALID');
	}
	const response = await fetch(source);
	if (!response.ok) {
		throw new Error('PLUGIN_RELEASE_DOWNLOAD_FAILED');
	}
	return readBytes(response, limit);
}

const [urlsArg, outputArg, basesArg = '[]', requiredAppsArg = '[]'] = process.argv.slice(2);
const urls = JSON.parse(urlsArg);
const bases = JSON.parse(basesArg);
const requiredApps = JSON.parse(requiredAppsArg);
if (
	!Array.isArray(urls) ||
	!Array.isArray(bases) ||
	!Array.isArray(requiredApps) ||
	requiredApps.some((packageId) => typeof packageId !== 'string' || !packageId || packageId.startsWith('--')) ||
	urls.length + bases.length === 0 ||
	!outputArg
) {
	throw new Error('PLUGIN_RELEASE_URLS_INVALID');
}
const output = path.resolve(outputArg);
const descriptors = [];

async function saveOriginal(descriptor, directory) {
	if (
		typeof descriptor.archiveName !== 'string' ||
		path.basename(descriptor.archiveName) !== descriptor.archiveName
	) {
		throw new Error('PLUGIN_RELEASE_URL_INVALID');
	}
	writeImmutable(
		path.join(directory, descriptor.archiveName),
		await download(descriptor.package.packageUrl, AGENT_PLUGIN_MAX_ARCHIVE_BYTES),
	);
	const descriptorPath = path.join(directory, 'package.release.json');
	writeImmutable(descriptorPath, Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`));
	descriptors.push(descriptorPath);
}

// Base entries retain their original URLs and signed bytes. No prior catalog is overwritten.
for (let index = 0; index < bases.length; index++) {
	const bytes = await download(bases[index], AGENT_PLUGIN_MAX_CATALOG_BYTES);
	const base = readAgentPluginCatalogIndex(
		JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
		bases[index],
	);
	writeImmutable(path.join(output, 'bases', String(index), 'catalog.json'), bytes);
	for (let packageIndex = 0; packageIndex < base.packages.length; packageIndex++) {
		const artifact = base.packages[packageIndex];
		const publisher = base.publishers.find((item) => item.keyId === artifact.publisherKeyId);
		if (!publisher) {
			throw new Error('PLUGIN_RELEASE_PUBLISHER_MISSING');
		}
		await saveOriginal(
			{
				schemaVersion: 2,
				publisher,
				package: artifact,
				archiveName: `${artifact.packageId}-${artifact.version}.tar`,
			},
			path.join(output, 'originals', `base-${index}-${packageIndex}`),
		);
	}
}

for (let index = 0; index < urls.length; index++) {
	const bytes = await download(urls[index], AGENT_PLUGIN_MAX_CATALOG_BYTES);
	const descriptor = readReleaseDescriptor(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
	await saveOriginal(descriptor, path.join(output, 'originals', `release-${index}`));
}
execFileSync(
	process.execPath,
	[
		path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-catalog-release.mjs'),
		path.join(output, 'catalog.json'),
		...descriptors,
		...requiredApps.flatMap((packageId) => ['--require-app', packageId]),
	],
	{ stdio: 'inherit' },
);
