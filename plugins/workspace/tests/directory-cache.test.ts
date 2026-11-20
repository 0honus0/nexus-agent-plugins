import { expect, it, vi } from 'vitest';
import { createDirectoryCache } from '../src/browser/files/directory-cache';
import type { RemoteDirectory } from '../src/shared/workspace-file-types';

it('shares an in-flight directory request and caches the canonical path', async () => {
	const response = Promise.withResolvers<RemoteDirectory>();
	const request = vi.fn(() => response.promise);
	const cache = createDirectoryCache(request, new AbortController().signal);
	const read = cache.read('.');
	expect(cache.idle()).toBe(false);
	expect(cache.read('.')).toBe(read);

	const listing = { path: '/home', entries: [] };
	response.resolve(listing);
	expect(await read).toBe(listing);
	expect(await cache.read('/home')).toBe(listing);
	expect(cache.idle()).toBe(true);
	expect(request).toHaveBeenCalledOnce();
});

it('discards a superseded listing even when the server answers after cancellation', async () => {
	const stale = Promise.withResolvers<RemoteDirectory>();
	const fresh = { path: '/folder', entries: [] };
	const received = Promise.withResolvers<AbortSignal>();
	const request = vi.fn(async (_path: string, signal: AbortSignal) => {
		if (request.mock.calls.length > 1) return fresh;
		received.resolve(signal);
		return stale.promise;
	});
	const cache = createDirectoryCache(request, new AbortController().signal);
	const first = cache.read('/folder');
	const oldSignal = await received.promise;
	cache.invalidate();
	expect(oldSignal.aborted).toBe(true);
	expect(await cache.read('/folder')).toBe(fresh);
	stale.resolve({ path: '/folder', entries: [] });
	await expect(first).rejects.toMatchObject({ name: 'AbortError' });
	expect(cache.get('/folder')).toBe(fresh);
});
