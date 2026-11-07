#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AGENT_PLUGIN_MAX_CATALOG_BYTES } from '@nexus-terminal/shared/agent/plugins/values';
import { readReleaseArtifact, readReleaseDescriptor, sha256 } from './lib/package-artifact.mjs';

const [directoryArg, repository, tag] = process.argv.slice(2);
if (!directoryArg || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? '') || !tag) {
	throw new Error('Usage: node scripts/publish-package-release.mjs <release-directory> <owner/repository> <tag>');
}
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
	throw new Error('PLUGIN_RELEASE_GITHUB_TOKEN_REQUIRED');
}
const directory = path.resolve(directoryArg);
const descriptors = fs.readdirSync(directory).filter((name) => name.endsWith('.release.json'));
if (descriptors.length !== 1) {
	throw new Error('PLUGIN_RELEASE_SINGLE_PACKAGE_REQUIRED');
}
const descriptorPath = path.join(directory, descriptors[0]);
const { release, archivePath } = readReleaseArtifact(descriptorPath);
if (path.basename(descriptorPath) !== `${release.package.packageId}-${release.package.version}.release.json`) {
	throw new Error('PLUGIN_RELEASE_DESCRIPTOR_NAME_INVALID');
}
const targetBase = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/`;
if (release.package.packageUrl !== new URL(release.archiveName, targetBase).href) {
	throw new Error('PLUGIN_RELEASE_TARGET_URL_MISMATCH');
}
const candidateArchive = fs.readFileSync(archivePath);
const candidateDescriptor = fs.readFileSync(descriptorPath);
const headers = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
const apiRoot = `https://api.github.com/repos/${repository}/`;

async function pages(resource) {
	let url = new URL(resource + '?per_page=100', apiRoot);
	const visited = new Set();
	const result = [];
	while (url !== null) {
		if (url.origin !== 'https://api.github.com' || !url.href.startsWith(apiRoot) || visited.has(url.href)) {
			throw new Error('PLUGIN_RELEASE_GITHUB_PAGE_INVALID');
		}
		visited.add(url.href);
		const response = await fetch(url, { headers: { ...headers, Accept: 'application/vnd.github+json' } });
		if (!response.ok) {
			throw new Error('PLUGIN_RELEASE_GITHUB_READ_FAILED');
		}
		const page = await response.json();
		if (!Array.isArray(page)) {
			throw new Error('PLUGIN_RELEASE_GITHUB_PAGE_INVALID');
		}
		result.push(...page);
		const next = response.headers
			.get('link')
			?.split(',')
			.find((part) => /;\s*rel="next"/u.test(part));
		const match = next?.match(/<([^>]+)>/u);
		url = match ? new URL(match[1]) : null;
	}
	return result;
}

async function assetBytes(asset, limit) {
	if (
		!Number.isSafeInteger(asset.id) ||
		asset.id < 1 ||
		!Number.isSafeInteger(asset.size) ||
		asset.size < 0 ||
		asset.size > limit
	) {
		throw new Error('PLUGIN_RELEASE_GITHUB_ASSET_INVALID');
	}
	const response = await fetch(new URL(`releases/assets/${asset.id}`, apiRoot), {
		headers: { ...headers, Accept: 'application/octet-stream' },
	});
	if (!response.ok || response.body === null) {
		throw new Error('PLUGIN_RELEASE_GITHUB_READ_FAILED');
	}
	const chunks = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.byteLength;
		if (size > limit) {
			throw new Error('PLUGIN_RELEASE_GITHUB_ASSET_INVALID');
		}
		chunks.push(chunk);
	}
	if (size !== asset.size) {
		throw new Error('PLUGIN_RELEASE_GITHUB_ASSET_INVALID');
	}
	return Buffer.concat(chunks, size);
}

const releases = await pages('releases');
let targetAssets = null;
for (const prior of releases) {
	if (!Number.isSafeInteger(prior.id) || prior.id < 1 || typeof prior.tag_name !== 'string') {
		throw new Error('PLUGIN_RELEASE_GITHUB_RELEASE_INVALID');
	}
	const assets = await pages(`releases/${prior.id}/assets`);
	if (prior.tag_name === tag) {
		if (prior.draft !== true) {
			throw new Error('PLUGIN_RELEASE_DRAFT_REQUIRED');
		}
		targetAssets = assets;
	}
	for (const asset of assets) {
		if (asset.name === release.archiveName) {
			if (asset.size !== candidateArchive.byteLength) {
				throw new Error('PLUGIN_RELEASE_IDENTITY_COLLISION');
			}
			const bytes = await assetBytes(asset, candidateArchive.byteLength);
			if (bytes.byteLength !== candidateArchive.byteLength || sha256(bytes) !== release.package.sha256) {
				throw new Error('PLUGIN_RELEASE_IDENTITY_COLLISION');
			}
		} else if (asset.name === path.basename(descriptorPath)) {
			const bytes = await assetBytes(asset, AGENT_PLUGIN_MAX_CATALOG_BYTES);
			const metadata = readReleaseDescriptor(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
			const artifact = metadata.package;
			if (
				metadata.schemaVersion !== 2 ||
				metadata.archiveName !== release.archiveName ||
				artifact.packageId !== release.package.packageId ||
				artifact.version !== release.package.version ||
				artifact.publisherKeyId !== release.package.publisherKeyId ||
				artifact.sha256 !== release.package.sha256 ||
				artifact.sizeBytes !== release.package.sizeBytes ||
				metadata.publisher.publicKeyPem !== release.publisher.publicKeyPem
			) {
				throw new Error('PLUGIN_RELEASE_IDENTITY_COLLISION');
			}
			if (prior.tag_name === tag && !bytes.equals(candidateDescriptor)) {
				throw new Error('PLUGIN_RELEASE_IMMUTABLE_CONFLICT');
			}
		}
	}
}
if (targetAssets === null) {
	throw new Error('PLUGIN_RELEASE_EXISTING_TAG_REQUIRED');
}

// Re-running after a partial upload verifies existing bytes, then uploads only missing assets.
// No clobber, delete, tag creation, publication or unknown-write retry occurs here.
for (const filename of [archivePath, descriptorPath]) {
	if (!targetAssets.some((asset) => asset.name === path.basename(filename))) {
		execFileSync('gh', ['release', 'upload', '--repo', repository, '--', tag, filename], { stdio: 'inherit' });
	}
}
console.log(
	`Verified immutable identity and uploaded missing assets: ${release.package.packageId}@${release.package.version}`,
);
