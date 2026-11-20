import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import { localSftp } from './fixtures/local-sftp';
import { RemoteArchives } from '../src/node/remote-archives';
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'remote-archives-'));
	roots.push(root);
	const sftp = localSftp();
	const archives = new RemoteArchives(
		{ sftp: async () => sftp } as unknown as SshConnectionApi,
		{
			script: async (command) => {
				try {
					const result = await promisify(execFile)('sh', ['-c', command], {
						maxBuffer: 16 * 1024 * 1024,
					});
					return { ...result, code: 0 };
				} catch (cause) {
					const e = cause as { code: number; stdout: string; stderr: string };
					return { code: e.code, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
				}
			},
		},
		new AbortController().signal,
	);
	return { root, archives };
}

it.each(['tar.gz', 'tar.bz2', 'zip'] as const)(
	'round-trips %s with safe symlinks, collisions and hidden files',
	async (format) => {
		const { root, archives } = await fixture();
		await mkdir(join(root, 'source'));
		await writeFile(join(root, 'source', '.hidden'), 'secret');
		await writeFile(join(root, 'source', 'hello.txt'), 'hello');
		await symlink('hello.txt', join(root, 'source', 'link'));
		const destination = join(root, 'sample.' + format);
		await archives.compress({ paths: [join(root, 'source')], destination, format });
		await mkdir(join(root, 'output'));
		await archives.extract({ archive: destination, destination: join(root, 'output'), format });
		expect(await readFile(join(root, 'output/source/.hidden'), 'utf8')).toBe('secret');
		expect((await lstat(join(root, 'output/source/link'))).isSymbolicLink()).toBe(true);
		await expect(
			archives.extract({ archive: destination, destination: join(root, 'output'), format }),
		).rejects.toMatchObject({ code: 'REMOTE_TOOLS_FILE_EXISTS' });
		expect((await readdir(root)).filter((p) => p.startsWith('.nexus-'))).toEqual([]);
	},
	30000,
);
it('rejects escaping archive symlinks before publication', async () => {
	const { root, archives } = await fixture();
	await mkdir(join(root, 'source'));
	await symlink('../../outside', join(root, 'source', 'escape'));
	const archive = join(root, 'unsafe.tar.gz');
	await promisify(execFile)('tar', ['-czf', archive, '-C', root, 'source']);
	await mkdir(join(root, 'output'));
	await expect(
		archives.extract({ archive, destination: join(root, 'output'), format: 'tar.gz' }),
	).rejects.toMatchObject({ code: 'REMOTE_TOOLS_ARCHIVE_UNSAFE' });
	expect(await readdir(join(root, 'output'))).toEqual([]);
});
it('round-trips an encrypted ZIP and preserves the password error', async () => {
	const { root, archives } = await fixture();
	await writeFile(join(root, 'file.txt'), 'encrypted');
	const archive = join(root, 'encrypted.zip');
	await archives.compress({
		paths: [join(root, 'file.txt')],
		destination: archive,
		format: 'zip',
		password: 'fixture-only',
	});
	await mkdir(join(root, 'output'));
	await expect(
		archives.extract({
			archive,
			destination: join(root, 'output'),
			format: 'zip',
			password: 'wrong',
		}),
	).rejects.toMatchObject({ code: 'REMOTE_TOOLS_ARCHIVE_PASSWORD_INVALID' });
	await archives.extract({
		archive,
		destination: join(root, 'output'),
		format: 'zip',
		password: 'fixture-only',
	});
	expect(await readFile(join(root, 'output/file.txt'), 'utf8')).toBe('encrypted');
}, 30000);
