import { expect, it } from 'vitest';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeShellIntegration } from '../src/node/remote-shell';
it('discovers a real interactive Bash PID, hides its setup and reads that shell directory', async () => {
	const root = await mkdtemp(join(tmpdir(), 'remote-shell-'));
	const child = spawn('script', ['-q', '-c', 'bash --noprofile --norc -i', '/dev/null'], {
		cwd: root,
		env: { ...process.env, TERM: 'xterm' },
	});
	let output = '';
	let prompts = 0;
	const shell = new NativeShellIntegration({
		write: (bytes) => {
			child.stdin.write(bytes);
		},

		execute: async (command, signal) => (await promisify(execFile)('sh', ['-c', command], { signal })).stdout,

		onPrompt: () => {
			prompts++;
		},
	});
	child.stdout.on('data', (bytes) => {
		output += Buffer.from(shell.filterOutput(bytes)).toString();
	});
	child.stderr.resume();
	try {
		await shell.ensureHook();
		await expect.poll(() => shell.isAtPrompt).toBe(true);
		expect(await shell.currentDirectory()).toBe(root);
		expect(output).not.toContain('__nexus_tty');
		expect(output).not.toContain('__NEXUS_SHELL');
		const before = prompts;
		shell.changeDirectory(tmpdir());
		await expect.poll(() => prompts).toBeGreaterThan(before);
		expect(await shell.currentDirectory()).toBe(tmpdir());
	} finally {
		shell.close();
		const stopped = once(child, 'close');
		child.kill('SIGTERM');
		await stopped;
		await rm(root, { recursive: true, force: true });
	}
}, 15000);
