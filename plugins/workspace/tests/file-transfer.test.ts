import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readlink, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localSftp } from '../../remote-tools/tests/fixtures/local-sftp';
import { transferWorkspaceFiles } from '../src/node/workspace-file-transfer';
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'workspace-copy-'));
	roots.push(root);
	await mkdir(join(root, 'source'));
	await mkdir(join(root, 'target'));
	return root;
}

const options = () => ({ signal: new AbortController().signal, move: false, overwrite: false });

it('copies a tree, hidden files and links and retains the source', async () => {
	const root = await fixture(),
		source = join(root, 'source'),
		target = join(root, 'target');
	await writeFile(join(source, '.hidden'), 'hello');
	await symlink('.hidden', join(source, 'link'));
	await transferWorkspaceFiles(localSftp(), localSftp(), [source], target, options());
	expect(await readFile(join(target, 'source/.hidden'), 'utf8')).toBe('hello');
	expect(await readlink(join(target, 'source/link'))).toBe('.hidden');
	expect(await readFile(join(source, '.hidden'), 'utf8')).toBe('hello');
	expect(await readdir(target)).toEqual(['source']);
});
it('requires overwrite and keeps existing directory permissions while merging', async () => {
	const root = await fixture(),
		source = join(root, 'source'),
		target = join(root, 'target');
	await writeFile(join(source, 'file'), 'new');
	await mkdir(join(target, 'source'), { mode: 0o750 });
	await writeFile(join(target, 'source/file'), 'old');
	await expect(transferWorkspaceFiles(localSftp(), localSftp(), [source], target, options())).rejects.toMatchObject({
		code: 'WORKSPACE_FILE_EXISTS',
	});
	expect(await readFile(join(target, 'source/file'), 'utf8')).toBe('old');
	await transferWorkspaceFiles(localSftp(), localSftp(), [source], target, {
		...options(),
		overwrite: true,
	});
	expect(await readFile(join(target, 'source/file'), 'utf8')).toBe('new');
	expect((await stat(join(target, 'source'))).mode & 0o777).toBe(0o750);
});
it('cuts only after copying and rejects a same-server descendant target', async () => {
	const root = await fixture(),
		source = join(root, 'source'),
		target = join(root, 'target');
	await writeFile(join(source, 'file'), 'move');
	await expect(
		transferWorkspaceFiles(localSftp(), localSftp(), [source], source, {
			...options(),
			sameServer: true,
		}),
	).rejects.toMatchObject({ code: 'WORKSPACE_TRANSFER_SAME_PATH' });
	await transferWorkspaceFiles(localSftp(), localSftp(), [source], target, {
		...options(),
		move: true,
	});
	await expect(stat(source)).rejects.toMatchObject({ code: 'ENOENT' });
	expect(await readFile(join(target, 'source/file'), 'utf8')).toBe('move');
});
it('rejects destination symlink ancestors without writing through them', async () => {
	const root = await fixture(),
		source = join(root, 'source'),
		target = join(root, 'target');
	await writeFile(join(source, 'file'), 'new');
	await mkdir(join(root, 'outside'));
	await symlink(join(root, 'outside'), join(target, 'source'));
	await expect(
		transferWorkspaceFiles(localSftp(), localSftp(), [source], target, {
			...options(),
			overwrite: true,
		}),
	).rejects.toMatchObject({ code: 'WORKSPACE_FILE_EXISTS' });
	expect(await readdir(join(root, 'outside'))).toEqual([]);
});
it('retains the original when publication fails and restores the overwrite backup', async () => {
	const root = await fixture(),
		source = join(root, 'source/file'),
		target = join(root, 'target');
	await writeFile(source, 'new');
	await writeFile(join(target, 'file'), 'old');
	const destination = localSftp(),
		rename = destination.rename.bind(destination);
	destination.rename = (from, to, callback) => {
		if (from.includes('/.nexus-copy-') && !from.includes('/.replace-') && to === join(target, 'file'))
			callback!(Object.assign(Error('fixture'), { code: 4 }));
		else rename(from, to, callback!);
	};
	await expect(
		transferWorkspaceFiles(localSftp(), destination, [source], target, {
			...options(),
			overwrite: true,
		}),
	).rejects.toMatchObject({ code: 4 });
	expect(await readFile(join(target, 'file'), 'utf8')).toBe('old');
	expect(await readFile(source, 'utf8')).toBe('new');
	expect(await readdir(target)).toEqual(['file']);
});

it('uses native staging when available and reports its real transport', async () => {
	const { cp } = await import('node:fs/promises');
	const root = await fixture(),
		source = join(root, 'source'),
		target = join(root, 'target');
	await writeFile(join(source, 'file'), 'native');
	const updates: unknown[] = [];
	await transferWorkspaceFiles(localSftp(), localSftp(), [source], target, {
		...options(),
		progress: {
			signal: options().signal,

			update: (patch) => updates.push(patch),
		},

		async native(stage, paths) {
			for (const path of paths)
				await cp(path, join(stage, path.split('/').pop()!), { recursive: true, preserveTimestamps: true });
			return { state: 'copied', method: 'rsync' };
		},
	});
	expect(await readFile(join(target, 'source/file'), 'utf8')).toBe('native');
	expect(updates).toContainEqual(expect.objectContaining({ method: 'rsync' }));
});

it('relays only an explicit pre-dispatch unavailable result and preserves unknown native staging', async () => {
	const root = await fixture(),
		source = join(root, 'source/file'),
		target = join(root, 'target');
	await writeFile(source, 'relay');
	await transferWorkspaceFiles(localSftp(), localSftp(), [source], target, {
		...options(),

		native: async () => ({ state: 'unavailable', reason: 'unreachable' }),
	});
	expect(await readFile(join(target, 'file'), 'utf8')).toBe('relay');
	await expect(
		transferWorkspaceFiles(localSftp(), localSftp(), [source], target, {
			...options(),
			overwrite: true,

			native: async () => {
				throw Object.assign(Error('unconfirmed'), { code: 'REMOTE_TOOLS_TRANSFER_UNKNOWN' });
			},
		}),
	).rejects.toMatchObject({ code: 'REMOTE_TOOLS_TRANSFER_UNKNOWN' });
	expect((await readdir(target)).some((path) => path.startsWith('.nexus-copy-'))).toBe(true);
	expect(await readFile(join(target, 'file'), 'utf8')).toBe('relay');
});

it('rejects traversal paths before opening a staging area', async () => {
	const root = await fixture();
	for (const path of [join(root, 'source') + '/..', join(root, 'source') + '/.', 'relative']) {
		await expect(
			transferWorkspaceFiles(localSftp(), localSftp(), [path], join(root, 'target'), options()),
		).rejects.toMatchObject({ code: 'WORKSPACE_INVALID_REQUEST' });
	}
	expect(await readdir(join(root, 'target'))).toEqual([]);
});
