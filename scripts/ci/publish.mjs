import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const branch = 'catalog';

function gh(args) {
	return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function viewRelease(tag) {
	try {
		return JSON.parse(gh(['release', 'view', tag, '--json', 'isDraft,assets']));
	} catch (cause) {
		if (cause.stderr?.includes('release not found')) return undefined;
		throw cause;
	}
}

function checkIntegrity(file, integrity) {
	const actual = 'sha512-' + createHash('sha512').update(readFileSync(file)).digest('base64');
	if (actual !== integrity) throw new Error(`Release asset has a different checksum: ${basename(file)}`);
}

function publishAsset(tag, path, metadata) {
	checkIntegrity(path, metadata.integrity);
	let release = viewRelease(tag);
	if (!release) {
		const flags = metadata.package.version.split('+', 1)[0].includes('-') ? ['--prerelease'] : [];
		gh(['release', 'create', tag, '--verify-tag', '--draft', '--latest=false', '--title', tag, ...flags]);
		release = viewRelease(tag);
	}
	if (!release.assets.some(({ name }) => name === metadata.file)) {
		if (!release.isDraft) throw new Error(`Published release is missing its expected asset: ${tag}`);
		gh(['release', 'upload', tag, path]);
	}

	// Retrying a tag must never replace bytes already available at its versioned URL.
	const directory = mkdtempSync(join(tmpdir(), 'nexus-release-'));
	try {
		gh(['release', 'download', tag, '--pattern', metadata.file, '--dir', directory]);
		checkIntegrity(join(directory, metadata.file), metadata.integrity);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
	if (release.isDraft) gh(['release', 'edit', tag, '--draft=false', '--latest=false']);

	const asset = viewRelease(tag)?.assets.find(({ name }) => name === metadata.file);
	if (!asset?.url) throw new Error(`Published release asset is unavailable: ${tag}`);
	return asset.url;
}

export function addVersion(catalog, version) {
	const id = version.package.name;
	const current = catalog.find((entry) => entry.id === id);
	if (!current) return [...catalog, { id, versions: [version] }];

	const previous = current.versions.find((entry) => entry.package.version === version.package.version);
	if (previous) {
		if (!isDeepStrictEqual(previous, version))
			throw new Error(`Catalog version already exists: ${id}@${version.package.version}`);
		return catalog;
	}
	return catalog.map((entry) => (entry === current ? { ...entry, versions: [...entry.versions, version] } : entry));
}

export async function updateCatalog(version, env = process.env) {
	const repository = env.GH_REPO;
	const url = `${env.GITHUB_API_URL ?? 'https://api.github.com'}/repos/${repository}`;
	const headers = {
		accept: 'application/vnd.github+json',
		authorization: `Bearer ${env.GH_TOKEN}`,
		'content-type': 'application/json',
		'x-github-api-version': '2022-11-28',
	};

	function request(path, method = 'GET', body) {
		return fetch(url + path, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
	}

	let ref = await request('/git/ref/heads/' + branch);
	if (ref.status === 404) {
		const created = await request('/git/refs', 'POST', {
			ref: 'refs/heads/' + branch,
			sha: env.CATALOG_BASE_SHA,
		});
		// Another plugin release may have created the catalog branch first.
		if (!created.ok && created.status !== 422)
			throw new Error(`Cannot create catalog branch: ${created.status} ${await created.text()}`);
		ref = await request('/git/ref/heads/' + branch);
	}
	if (!ref.ok) throw new Error(`Cannot read catalog branch: ${ref.status}`);

	for (let attempt = 0; attempt < 6; attempt++) {
		const response = await request('/contents/catalog.json?ref=' + branch);
		if (!response.ok && response.status !== 404) throw new Error(`Cannot read catalog: ${response.status}`);
		const current = response.ok ? await response.json() : undefined;
		const catalog = current ? JSON.parse(Buffer.from(current.content, 'base64').toString('utf8')) : [];
		const updated = addVersion(catalog, version);
		if (catalog === updated) return;

		// The file SHA makes this an atomic update. On conflict merge with the new index.
		const saved = await request('/contents/catalog.json', 'PUT', {
			message: `Publish ${version.package.name}@${version.package.version}`,
			branch,
			content: Buffer.from(JSON.stringify(updated, null, 2) + '\n').toString('base64'),
			sha: current?.sha,
		});
		if (saved.ok) return;
		if (saved.status !== 409 && saved.status !== 422)
			throw new Error(`Cannot update catalog: ${saved.status} ${await saved.text()}`);
		await delay(250 * 2 ** attempt);
	}
	throw new Error('Catalog update conflicted repeatedly. Retry the same plugin release.');
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
	const [tag, destination] = process.argv.slice(2);
	const metadata = JSON.parse(readFileSync(join(destination, 'metadata.json'), 'utf8'));
	const expectedFile = `${tag.split('/')[0]}-${metadata.package.version}.tgz`;
	if (
		metadata.file !== expectedFile ||
		basename(metadata.file) !== metadata.file ||
		!tag.endsWith('/v' + metadata.package.version)
	)
		throw new Error('Release tag does not match the artifact metadata');
	const tarball = publishAsset(tag, join(destination, metadata.file), metadata);
	await updateCatalog({ package: metadata.package, distributions: [{ tarball, integrity: metadata.integrity }] });
	console.log(`Published ${metadata.package.name}@${metadata.package.version}`);
}
