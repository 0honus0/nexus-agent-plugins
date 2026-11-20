import { addAbortListener } from 'node:events';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import { quote } from 'shell-quote';
import { z } from 'zod';
import {
	RemoteEnvironmentSchema,
	RemoteToolNameSchema,
	type RemoteCommand,
	type RemoteCommandResult,
	type RemoteEnvironment,
	type ServerStatus,
} from '../shared/remote-tools-types.js';
import { LinuxStatusParser } from './linux-status-parser.js';
import { RemoteArchives } from './remote-archives.js';
import { RemoteCommandExecutor } from './remote-command.js';
import { NativeShellIntegration } from './remote-shell.js';
import type { RemoteShellOptions } from './remote-shell-types.js';
import type { RemoteArchiveApi, RemoteShellApi, RemoteToolsSessionApi } from './remote-tools-api.js';
import { RemoteCommandError, RemoteToolsError } from './remote-tools-error.js';
import { RemoteTransfer } from './remote-transfer.js';

const toolsSchema = z.array(RemoteToolNameSchema).max(100);

/** 管理这次绑定的操作和采样。调用方继续持有 SSH 和 PTY。 */
export class RemoteToolsSession implements RemoteToolsSessionApi {
	readonly archives: RemoteArchiveApi;
	readonly #controller = new AbortController();
	readonly #commands: RemoteCommandExecutor;
	readonly #transfer: RemoteTransfer;
	readonly #parser = new LinuxStatusParser();
	readonly #pending = new Set<Promise<unknown>>();
	readonly #shells = new Set<RemoteShellApi>();
	readonly #stopObserving: () => void;
	readonly #abortSubscription: Disposable;
	#statusQueue: Promise<unknown> = Promise.resolve();
	#closing?: Promise<void>;
	#releaseRegistrations?: () => void;

	constructor(connection: SshConnectionApi, ownerSignal: AbortSignal) {
		const signal = this.#controller.signal;
		this.#commands = new RemoteCommandExecutor(connection);
		const archives = new RemoteArchives(connection, this.#commands, signal);
		this.archives = {
			compress: (input, options) => this.#track(() => archives.compress(input, options)),

			extract: (input, options) => this.#track(() => archives.extract(input, options)),
		};
		this.#transfer = new RemoteTransfer(connection, this.#commands, signal);
		this.#abortSubscription = addAbortListener(ownerSignal, () => void this.close());
		this.#stopObserving = connection.onStateChange(({ state }) => {
			if (state !== 'connected') void this.close();
		});
		if (ownerSignal.aborted || connection.getState().state !== 'connected') void this.close();
	}

	onClosed(release: () => void): void {
		if (this.#closing) void this.#closing.then(release);
		else this.#releaseRegistrations = release;
	}

	copyFiles(...args: Parameters<RemoteToolsSessionApi['copyFiles']>): ReturnType<RemoteToolsSessionApi['copyFiles']> {
		return this.#track(() => this.#transfer.copy(...args));
	}

	openShell(options: Omit<RemoteShellOptions, 'execute'>): RemoteShellApi {
		this.#assertOpen();
		const shell = new NativeShellIntegration(
			{
				...options,

				execute: (command, signal) =>
					this.#track(async () => {
						const result = await this.#commands.script(command, this.#signal(signal));
						if (result.code !== 0) throw new RemoteCommandError(result.code);
						return result.stdout;
					}),
			},
			() => this.#shells.delete(shell),
		);
		this.#shells.add(shell);
		return shell;
	}

	execute(command: RemoteCommand, options?: { signal?: AbortSignal }): Promise<RemoteCommandResult> {
		return this.#track(() => this.#commands.execute(command, this.#signal(options?.signal)));
	}

	inspect(
		tools = ['tar', 'cp', 'mv', 'gzip', 'unzip', 'rsync'] as readonly string[],
		options?: { signal?: AbortSignal },
	): Promise<RemoteEnvironment> {
		return this.#track(async () => {
			const names = [...new Set(toolsSchema.parse(tools))];
			const probes = names.map(
				(name) => `if command -v ${quote([name])} >/dev/null 2>&1; then printf '1\\n'; else printf '0\\n'; fi`,
			);
			const result = await this.#commands.script(
				['uname -s', ...probes].join('; '),
				this.#signal(options?.signal),
			);
			const [kernel, ...flags] = result.stdout.trim().split(/\r?\n/u);
			if (
				result.code !== 0 ||
				!kernel ||
				flags.length !== names.length ||
				flags.some((flag) => flag !== '0' && flag !== '1')
			)
				throw new RemoteToolsError('REMOTE_TOOLS_ENVIRONMENT_UNAVAILABLE');

			return RemoteEnvironmentSchema.parse({
				kernel,
				platform: kernel === 'Linux' ? 'linux' : 'unsupported',
				tools: names.map((name, index) => ({ name, available: flags[index] === '1' })),
			});
		});
	}

	getStatus(options?: { signal?: AbortSignal }): Promise<ServerStatus> {
		return this.#track(() => {
			const signal = this.#signal(options?.signal);
			const task = this.#statusQueue.then(async () => {
				const result = await this.#commands.script(this.#parser.command(), signal);
				if (result.code === null) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_OUTCOME_UNKNOWN');
				if (result.code !== 0) throw new RemoteCommandError(result.code);
				if (signal.aborted) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_CANCELED');
				return this.#parser.parse(result.stdout);
			});
			this.#statusQueue = task.catch(() => this.#parser.clear());
			return task;
		});
	}

	resetStatus(): void {
		this.#parser.clear();
	}

	close(): Promise<void> {
		if (this.#closing) return this.#closing;
		// 先保留 Promise，取消通知可能同步重入 close。
		this.#closing = Promise.resolve().then(async () => {
			await Promise.allSettled(this.#pending);
			this.#releaseRegistrations?.();
		});
		this.#controller.abort();
		this.#abortSubscription[Symbol.dispose]();
		this.#stopObserving();
		this.#parser.clear();
		for (const shell of this.#shells) shell.close();
		this.#shells.clear();
		return this.#closing;
	}

	#assertOpen(): void {
		if (this.#controller.signal.aborted) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_DISPOSED');
	}

	#signal(signal?: AbortSignal): AbortSignal {
		return signal ? AbortSignal.any([this.#controller.signal, signal]) : this.#controller.signal;
	}

	async #track<T>(operation: () => Promise<T>): Promise<T> {
		this.#assertOpen();
		const pending = operation();
		this.#pending.add(pending);
		try {
			return await pending;
		} finally {
			this.#pending.delete(pending);
		}
	}
}
