import childProcess from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

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

function githubReleaseAsset(source, limit) {
	if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
		return null;
	}
	const match = source.pathname.match(
		/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/download\/([^/]+)\/([A-Za-z0-9_.-]+)$/u,
	);
	if (source.origin !== 'https://github.com' || source.username || source.password || source.search || !match) {
		return null;
	}
	console.warn(`Reading release asset through the GitHub API: ${source.origin}${source.pathname}`);
	const bytes = childProcess.execFileSync(
		'gh',
		[
			'release',
			'download',
			'--repo',
			match[1] + '/' + match[2],
			'--pattern',
			match[4],
			'--output',
			'-',
			'--',
			decodeURIComponent(match[3]),
		],
		{ maxBuffer: limit + 1 },
	);
	if (bytes.byteLength > limit) {
		throw new Error('PLUGIN_RELEASE_DOWNLOAD_TOO_LARGE');
	}
	return bytes;
}

/** Retry only idempotent reads after transient network/5xx failures; archive identity is checked later. */
export async function downloadReleaseBytes(url, limit) {
	const source = new URL(url);
	if (source.protocol !== 'https:') {
		throw new Error('PLUGIN_RELEASE_URL_INVALID');
	}
	for (let attempt = 0; ; attempt++) {
		let response;
		try {
			response = await fetch(source);
			if (response.ok) {
				return await readBytes(response, limit);
			}
		} catch (error) {
			if (!(error instanceof TypeError)) {
				throw error;
			}
			response = undefined;
		}
		const retryable = !response || response.status >= 500;
		await response?.body?.cancel();
		if (!retryable || attempt === 2) {
			if (retryable) {
				const bytes = githubReleaseAsset(source, limit);
				if (bytes !== null) {
					return bytes;
				}
			}
			throw new Error(
				`PLUGIN_RELEASE_DOWNLOAD_FAILED: ${source.origin}${source.pathname} HTTP ${response?.status ?? 'network'}`,
			);
		}
		console.warn(`Retrying release read: ${source.origin}${source.pathname} HTTP ${response?.status ?? 'network'}`);
		await setTimeout(1000 * 2 ** attempt);
	}
}
