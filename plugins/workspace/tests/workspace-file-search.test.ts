import { expect, it, vi } from 'vitest';
import { searchRemoteFiles } from '../src/node/workspace-file-search';
import type { FileEntry, RemoteDirectory } from '../src/shared/workspace-file-types';

const entry = (path: string, kind: FileEntry['kind'] = 'file'): FileEntry => ({
	path,
	name: path.split('/').at(-1)!,
	kind,
	size: 0,
	mode: 0,
	modifiedAt: 0,
});

const signal = () => new AbortController().signal;

it('searches subfolders by filename, returns relative paths and never follows symlinks', async () => {
	const tree: Record<string, FileEntry[]> = {
		'/': [entry('/folder', 'directory'), entry('/link', 'link'), entry('/readme.txt')],
		'/folder': [entry('/folder/README.md')],
	};
	const list = vi.fn(async (path: string): Promise<RemoteDirectory> => ({
		path,
		entries: tree[path],
	}));
	const result = await searchRemoteFiles(list, '/', 'readme', signal());
	expect(result).toMatchObject({
		truncated: false,
		entries: [{ relativePath: 'readme.txt' }, { relativePath: 'folder/README.md' }],
	});
	expect(list.mock.calls.map(([path]) => path)).toEqual(['/', '/folder']);
});
it('marks inaccessible subfolders partial, while retaining root and transport errors', async () => {
	const list = async (path: string): Promise<RemoteDirectory> => {
		if (path !== '/') throw Object.assign(new Error(), { code: 3 });
		return { path, entries: [entry('/private', 'directory'), entry('/result')] };
	};

	expect(await searchRemoteFiles(list, '/', 'result', signal())).toMatchObject({
		truncated: true,
		entries: [{ name: 'result' }],
	});
	await expect(searchRemoteFiles(list, '/private', 'result', signal())).rejects.toMatchObject({
		code: 3,
	});
});
it('bounds results and stops scheduling when cancelled', async () => {
	const controller = new AbortController();
	const list = vi.fn(async (path: string) => ({
		path,
		entries: Array.from({ length: 1002 }, (_, i) => entry('/match-' + i)),
	}));
	const result = await searchRemoteFiles(list, '/', 'match', signal());
	expect(result.entries).toHaveLength(1000);
	expect(result.truncated).toBe(true);
	controller.abort();
	list.mockClear();
	await expect(searchRemoteFiles(list, '/', 'match', controller.signal)).rejects.toBeDefined();
	expect(list).not.toHaveBeenCalled();
});
