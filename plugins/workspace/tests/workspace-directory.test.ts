import { EventEmitter } from 'node:events';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type { SFTPWrapper } from 'ssh2';
import { expect, it, vi } from 'vitest';
import { createWorkspaceFiles } from '../src/node/workspace-files';

function files(
	realpath: SFTPWrapper['realpath'],
	readdir: (path: string, callback: (error?: Error, entries?: []) => void) => void,
) {
	const sftp = Object.assign(new EventEmitter(), { realpath, readdir });
	return createWorkspaceFiles({ sftp: async () => sftp as unknown as SFTPWrapper } as SshConnectionApi);
}

it('starts reading absolute directories while the canonical path is still being resolved', async () => {
	const readStarted = Promise.withResolvers<string>();
	const resolvePath = Promise.withResolvers<string>();
	const browser = files(
		(_path, reply) => void resolvePath.promise.then((path) => reply(undefined, path)),
		(path, reply) => {
			readStarted.resolve(path);
			reply(undefined, []);
		},
	);

	const result = browser.list('/alias');
	try {
		await expect(readStarted.promise).resolves.toBe('/alias');
	} finally {
		resolvePath.resolve('/directory');
	}
	await expect(result).resolves.toEqual({ path: '/directory', entries: [] });
});

it('uses the canonical directory when the server rejects a direct read of its alias', async () => {
	const readdir = vi.fn((path: string, reply: (error?: Error, entries?: []) => void) => {
		if (path === '/alias') reply(new Error('Direct read unavailable'));
		else reply(undefined, []);
	});
	const browser = files((_path, reply) => reply(undefined, '/directory'), readdir);

	await expect(browser.list('/alias')).resolves.toEqual({ path: '/directory', entries: [] });
	expect(readdir.mock.calls.map(([path]) => path)).toEqual(['/alias', '/directory']);
});
