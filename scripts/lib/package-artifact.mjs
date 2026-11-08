import { createHash, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { list as listArchive } from 'tar';
import { readAgentPluginManifest } from '@nexus-terminal/shared/agent/plugins/http-codec';
import { readAgentPluginCatalogIndex } from '@nexus-terminal/shared/agent/plugins/repository-http-codec';
import {
	AGENT_PLUGIN_MAX_ARCHIVE_BYTES,
	AGENT_PLUGIN_MAX_CATALOG_BYTES,
	AGENT_PLUGIN_MAX_EXPANDED_BYTES,
	AGENT_PLUGIN_MAX_PACKAGE_FILE_BYTES,
	AGENT_PLUGIN_MAX_MANIFEST_BYTES,
	AGENT_PLUGIN_MAX_FILE_LIST_BYTES,
	AGENT_PLUGIN_MAX_PACKAGE_ENTRIES,
	AGENT_PLUGIN_MAX_ENTRY_BYTES,
} from '@nexus-terminal/shared/agent/plugins/values';

export const signatureDomain = Buffer.from('NEXUS_AGENT_PLUGIN_V4\0', 'utf8');

export function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

export function publisherIdentity(key) {
	const publicKey = typeof key === 'object' && key.type === 'public' ? key : createPublicKey(key);
	if (publicKey.asymmetricKeyType !== 'ed25519') {
		throw new Error('PLUGIN_SIGNING_KEY_INVALID');
	}
	return {
		keyId: `ed25519:${sha256(publicKey.export({ type: 'spki', format: 'der' }))}`,
		publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
	};
}

export function visitFiles(directory, prefix = '') {
	const result = [];
	for (const entry of fs
		.readdirSync(directory, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name))) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			result.push(...visitFiles(target, relative));
		} else if (entry.isFile()) {
			const bytes = fs.readFileSync(target);
			result.push({ path: relative, sha256: sha256(bytes), sizeBytes: bytes.byteLength });
		} else {
			throw new Error('PLUGIN_SOURCE_ENTRY_INVALID');
		}
	}
	return result;
}

export function readManifestFile(source) {
	const sourceManifest = fs.readFileSync(path.join(source, 'manifest.json'));
	if (sourceManifest.byteLength > AGENT_PLUGIN_MAX_MANIFEST_BYTES) {
		throw new Error('PLUGIN_MANIFEST_LIMIT_EXCEEDED');
	}
	return readAgentPluginManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(sourceManifest)));
}

export function readSourceManifest(source) {
	const manifest = readManifestFile(source);
	if (fs.existsSync(path.join(source, 'agent.json'))) {
		throw new Error('PLUGIN_SECONDARY_CONTRIBUTION_DENIED');
	}
	for (const entry of [
		manifest.frontendEntry,
		manifest.backendEntry,
		manifest.contributions.settings?.frontendEntry ?? null,
		manifest.contributions.settings?.instructions ?? null,
		...manifest.contributions.skills.map((skill) => skill.path),
	]) {
		if (entry !== null && !fs.statSync(path.join(source, entry)).isFile()) {
			throw new Error('PLUGIN_ENTRY_MISSING');
		}
	}
	for (const directory of ['frontend', 'backend', 'skills', 'docs']) {
		const target = path.join(source, directory);
		if (fs.existsSync(target)) {
			if (!fs.lstatSync(target).isDirectory()) {
				throw new Error('PLUGIN_SOURCE_ENTRY_INVALID');
			}
			visitFiles(target);
		}
	}
	return manifest;
}

export function contributionKinds(manifest) {
	const result = [];
	if (manifest.contributions.app !== null) {
		result.push('app');
	}
	if (manifest.contributions.tools) {
		result.push('tools');
	}
	if (manifest.contributions.services) {
		result.push('services');
	}
	if (manifest.contributions.settings) {
		result.push('settings');
	}
	if (manifest.contributions.ui !== null) {
		result.push('ui');
	}
	if (manifest.contributions.skills.length) {
		result.push('skills');
	}
	return result;
}

export function writeImmutable(target, bytes) {
	fs.mkdirSync(path.dirname(target), { recursive: true });
	try {
		fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o644 });
	} catch (error) {
		if (error?.code !== 'EEXIST' || !fs.readFileSync(target).equals(bytes)) {
			throw new Error('PLUGIN_RELEASE_IMMUTABLE_CONFLICT', { cause: error });
		}
	}
}

export function inspectArtifact(archivePath, publicKeyPem) {
	if (fs.statSync(archivePath).size > AGENT_PLUGIN_MAX_ARCHIVE_BYTES) {
		throw new Error('PLUGIN_ARCHIVE_LIMIT_EXCEEDED');
	}
	const names = [];
	let expandedBytes = 0;
	listArchive({
		file: archivePath,
		sync: true,
		strict: true,

		onReadEntry(entry) {
			if (entry.type !== 'File' && entry.type !== 'Directory') {
				throw new Error('PLUGIN_ARCHIVE_ENTRY_INVALID');
			}
			expandedBytes += entry.size;
			if (entry.size > AGENT_PLUGIN_MAX_PACKAGE_FILE_BYTES || expandedBytes > AGENT_PLUGIN_MAX_EXPANDED_BYTES) {
				throw new Error('PLUGIN_ARCHIVE_LIMIT_EXCEEDED');
			}
			names.push(entry.path);
			if (names.length > AGENT_PLUGIN_MAX_PACKAGE_ENTRIES) {
				throw new Error('PLUGIN_ARCHIVE_LIMIT_EXCEEDED');
			}
		},
	});

	const read = (name) =>
		execFileSync('tar', ['-xOf', archivePath, `./${name}`], { maxBuffer: AGENT_PLUGIN_MAX_PACKAGE_FILE_BYTES });

	const manifestBytes = read('manifest.json');
	if (manifestBytes.byteLength > AGENT_PLUGIN_MAX_MANIFEST_BYTES) {
		throw new Error('PLUGIN_MANIFEST_LIMIT_EXCEEDED');
	}
	const manifest = readAgentPluginManifest(
		JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)),
	);
	const listBytes = read('files.json');
	if (listBytes.byteLength > AGENT_PLUGIN_MAX_FILE_LIST_BYTES) {
		throw new Error('PLUGIN_FILE_LIST_LIMIT_EXCEEDED');
	}
	const list = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(listBytes));
	const publisher = publisherIdentity(publicKeyPem);
	if (
		Object.keys(list).length !== 3 ||
		list.schemaVersion !== 1 ||
		list.publisherKeyId !== publisher.keyId ||
		!Array.isArray(list.files)
	) {
		throw new Error('PLUGIN_FILE_LIST_INVALID');
	}
	const signed = Buffer.concat([signatureDomain, manifestBytes, Buffer.from([0]), listBytes]);
	if (!verify(null, signed, publicKeyPem, read('signature.ed25519'))) {
		throw new Error('PLUGIN_SIGNATURE_INVALID');
	}
	const expected = new Set(['./manifest.json', './files.json', './signature.ed25519']);
	for (const file of list.files) {
		if (
			file === null ||
			typeof file !== 'object' ||
			Array.isArray(file) ||
			Object.keys(file).length !== 3 ||
			typeof file.path !== 'string' ||
			Buffer.byteLength(file.path) > AGENT_PLUGIN_MAX_ENTRY_BYTES ||
			file.path.split('/').length > 32 ||
			!Number.isSafeInteger(file.sizeBytes) ||
			file.sizeBytes < 0 ||
			typeof file.sha256 !== 'string' ||
			!/^[a-f0-9]{64}$/.test(file.sha256) ||
			file.path.split('/').some((part) => !/^[A-Za-z0-9_.-]{1,255}$/.test(part) || part.startsWith('.')) ||
			expected.has(`./${file.path}`)
		) {
			throw new Error('PLUGIN_FILE_LIST_INVALID');
		}
		const bytes = read(file.path);
		if (bytes.byteLength !== file.sizeBytes || sha256(bytes) !== file.sha256) {
			throw new Error('PLUGIN_FILE_HASH_INVALID');
		}
		expected.add(`./${file.path}`);
	}
	for (const entry of [
		manifest.frontendEntry,
		manifest.backendEntry,
		manifest.contributions.settings?.frontendEntry ?? null,
		manifest.contributions.settings?.instructions ?? null,
		...manifest.contributions.skills.map((skill) => skill.path),
	]) {
		if (entry !== null && !expected.has(`./${entry}`)) {
			throw new Error('PLUGIN_ARCHIVE_ENTRY_MISSING');
		}
	}
	if (expected.has('./agent.json')) {
		throw new Error('PLUGIN_SECONDARY_CONTRIBUTION_DENIED');
	}
	for (const name of names) {
		if (name === './' || (name.endsWith('/') && [...expected].some((entry) => entry.startsWith(name)))) {
			continue;
		}
		if (!expected.delete(name)) {
			throw new Error('PLUGIN_ARCHIVE_CONTENT_MISMATCH');
		}
	}
	if (expected.size) {
		throw new Error('PLUGIN_ARCHIVE_CONTENT_MISMATCH');
	}
	const bytes = fs.readFileSync(archivePath);
	return { manifest, publisher, sha256: sha256(bytes), sizeBytes: bytes.byteLength };
}

export function catalogEntry(manifest, publisherKeyId, archiveHash, sizeBytes, packageUrl) {
	return {
		packageId: manifest.id,
		version: manifest.version,
		compatibility: manifest.compatibility,
		contributionKinds: contributionKinds(manifest),
		displayName: manifest.displayName,
		description: `Nexus plugin: ${manifest.displayName}.`,
		packageUrl,
		sha256: archiveHash,
		sizeBytes,
		publisherKeyId,
	};
}

export function readReleaseDescriptor(metadata) {
	if (
		metadata === null ||
		typeof metadata !== 'object' ||
		Array.isArray(metadata) ||
		Object.keys(metadata).length !== 4 ||
		metadata.schemaVersion !== 2 ||
		typeof metadata.archiveName !== 'string' ||
		path.basename(metadata.archiveName) !== metadata.archiveName
	) {
		throw new Error('PLUGIN_RELEASE_METADATA_INVALID');
	}
	const decoded = readAgentPluginCatalogIndex({
		schemaVersion: 2,
		publishers: [metadata.publisher],
		packages: [metadata.package],
	});
	const publisher = decoded.publishers[0];
	const artifact = decoded.packages[0];
	if (metadata.archiveName !== `${artifact.packageId}-${artifact.version}.tar`) {
		throw new Error('PLUGIN_RELEASE_METADATA_INVALID');
	}
	return { schemaVersion: 2, publisher, package: artifact, archiveName: metadata.archiveName };
}

// Catalog presentation can be localized independently; executable identity remains archive-derived.
function releaseIdentity(entry) {
	return {
		packageId: entry.packageId,
		version: entry.version,
		compatibility: entry.compatibility,
		contributionKinds: entry.contributionKinds,
		packageUrl: entry.packageUrl,
		sha256: entry.sha256,
		sizeBytes: entry.sizeBytes,
		publisherKeyId: entry.publisherKeyId,
	};
}

/** A descriptor is accepted only together with the original signed archive it describes. */
export function readReleaseArtifact(releasePath) {
	const bytes = fs.readFileSync(releasePath);
	if (bytes.byteLength > AGENT_PLUGIN_MAX_CATALOG_BYTES) {
		throw new Error('PLUGIN_RELEASE_METADATA_LIMIT_EXCEEDED');
	}
	const release = readReleaseDescriptor(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
	const archivePath = path.join(path.dirname(releasePath), release.archiveName);
	const publisher = release.publisher;
	const artifact = release.package;
	const inspected = inspectArtifact(archivePath, publisher.publicKeyPem);
	const expected = catalogEntry(
		inspected.manifest,
		inspected.publisher.keyId,
		inspected.sha256,
		inspected.sizeBytes,
		artifact.packageUrl,
	);
	if (
		JSON.stringify(releaseIdentity(artifact)) !== JSON.stringify(releaseIdentity(expected)) ||
		publisher.keyId !== inspected.publisher.keyId
	) {
		throw new Error('PLUGIN_RELEASE_METADATA_MISMATCH');
	}
	return {
		archivePath,
		manifest: inspected.manifest,
		release: {
			schemaVersion: 2,
			publisher,
			package: {
				packageId: expected.packageId,
				version: expected.version,
				compatibility: expected.compatibility,
				contributionKinds: expected.contributionKinds,
				displayName: artifact.displayName,
				description: artifact.description,
				localizations: artifact.localizations?.map((item) => ({
					locale: item.locale,
					displayName: item.displayName,
					description: item.description,
				})),
				packageUrl: expected.packageUrl,
				sha256: expected.sha256,
				sizeBytes: expected.sizeBytes,
				publisherKeyId: expected.publisherKeyId,
			},
			archiveName: release.archiveName,
		},
	};
}
