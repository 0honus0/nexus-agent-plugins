import childProcess from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { downloadReleaseBytes } from './lib/release-download.mjs';
const url = 'https://example.test/releases/package.tar';

test('release download recovers a transient gateway response without changing bytes', async (t) => {
	let calls = 0;
	t.mock.method(globalThis, 'fetch', async () =>
		++calls === 1 ? new Response('gateway', { status: 504 }) : new Response('signed archive'),
	);
	assert.equal((await downloadReleaseBytes(url, 100)).toString(), 'signed archive');
	assert.equal(calls, 2);
});

test('release download retries network reads and reports exhausted HTTP failures safely', async (t) => {
	let calls = 0;
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		if (calls === 1) {
			throw new TypeError('fetch failed');
		}
		return new Response('original');
	});
	assert.equal((await downloadReleaseBytes(url, 100)).toString(), 'original');
	assert.equal(calls, 2);
	calls = 0;
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		return new Response('gateway', { status: 502 });
	});
	await assert.rejects(
		downloadReleaseBytes(url + '?secret=excluded', 100),
		(error) => error.message.includes('HTTP 502') && !error.message.includes('secret'),
	);
	assert.equal(calls, 3);
});

test('release download does not retry missing assets, invalid schemes or capacity refusals', async (t) => {
	let calls = 0;
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		return new Response('missing', { status: 404 });
	});
	await assert.rejects(downloadReleaseBytes(url, 100), /HTTP 404/);
	assert.equal(calls, 1);
	await assert.rejects(downloadReleaseBytes('http://example.test/package', 100), /URL_INVALID/);
	assert.equal(calls, 1);
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		return new Response('too large');
	});
	await assert.rejects(downloadReleaseBytes(url, 1), /DOWNLOAD_TOO_LARGE/);
	assert.equal(calls, 2);
});

test('release download restarts a failed response stream instead of returning partial archive bytes', async (t) => {
	let calls = 0;
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		if (calls === 1) {
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.error(new TypeError('socket ended'));
					},
				}),
			);
		}
		return new Response('complete archive');
	});
	assert.equal((await downloadReleaseBytes(url, 100)).toString(), 'complete archive');
	assert.equal(calls, 2);
});

test('canonical GitHub assets can use the authenticated API after gateway failure while keeping original bytes', async (t) => {
	const previous = process.env.GH_TOKEN;
	process.env.GH_TOKEN = 'test-token';
	t.after(() => {
		if (previous === undefined) {
			delete process.env.GH_TOKEN;
		} else {
			process.env.GH_TOKEN = previous;
		}
	});
	let calls = 0;
	t.mock.method(globalThis, 'fetch', async () => {
		calls++;
		return new Response('gateway', { status: 504 });
	});
	const cli = t.mock.method(childProcess, 'execFileSync', (command, args, options) => {
		assert.equal(command, 'gh');
		assert.deepEqual(args, [
			'release',
			'download',
			'--repo',
			'owner/repository',
			'--pattern',
			'package.tar',
			'--output',
			'-',
			'--',
			'v2.1.0',
		]);
		assert.equal(options.maxBuffer, 101);
		return Buffer.from('original signed archive');
	});
	const result = await downloadReleaseBytes(
		'https://github.com/owner/repository/releases/download/v2.1.0/package.tar',
		100,
	);
	assert.equal(result.toString(), 'original signed archive');
	assert.equal(calls, 3);
	assert.equal(cli.mock.callCount(), 1);
});
