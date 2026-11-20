import { addAbortListener } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { quote } from 'shell-quote';
import type { ClientChannel } from 'ssh2';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import { RemoteCommandSchema, type RemoteCommand, type RemoteCommandResult } from '../shared/remote-tools-types.js';
import { RemoteToolsError } from './remote-tools-error.js';

export class RemoteCommandExecutor {
	constructor(private readonly connection: Pick<SshConnectionApi, 'exec'>) {}

	async execute(input: RemoteCommand, signal: AbortSignal): Promise<RemoteCommandResult> {
		const { executable, args, cwd, timeoutMs, maxOutputBytes } = RemoteCommandSchema.parse(input);
		const invocation = quote([executable, ...args]);
		const command = cwd ? `cd ${quote([cwd])} && ${invocation}` : invocation;
		const out = new StringDecoder();
		const err = new StringDecoder();
		let stdout = '';
		let stderr = '';
		let bytes = 0;

		const exit = await this.#run(command, signal, timeoutMs, (chunk, isStderr) => {
			bytes += chunk.length;
			if (bytes > maxOutputBytes) throw new RemoteToolsError('REMOTE_TOOLS_EXEC_OUTPUT_LIMIT');
			if (isStderr) stderr += err.write(chunk);
			else stdout += out.write(chunk);
		});
		return { stdout: stdout + out.end(), stderr: stderr + err.end(), ...exit };
	}

	script(
		script: string,
		signal: AbortSignal,
		options?: Pick<RemoteCommand, 'timeoutMs' | 'maxOutputBytes'>,
	): Promise<RemoteCommandResult> {
		return this.execute({ executable: 'sh', args: ['-c', script], ...options }, signal);
	}

	/** 文件传输只消费进度，避免把长时间输出攒进内存。 */
	stream(script: string, signal: AbortSignal, onOutput: (chunk: Buffer) => void): Promise<CommandExit> {
		return this.#run(
			script,
			signal,
			null,
			(chunk, stderr) => {
				if (!stderr) onOutput(chunk);
			},
			true,
		);
	}

	#run(
		command: string,
		signal: AbortSignal,
		timeoutMs: number | null,
		onOutput: (chunk: Buffer, stderr: boolean) => void,
		terminateOnAbort = false,
	): Promise<CommandExit> {
		if (signal.aborted) return Promise.reject(new RemoteToolsError('REMOTE_TOOLS_EXEC_CANCELED'));

		const result = Promise.withResolvers<CommandExit>();
		let channel: ClientChannel | undefined;
		let settled = false;
		let exit: CommandExit | undefined;

		const abort = addAbortListener(signal, () => {
			if (terminateOnAbort) channel?.signal('TERM');
			fail(new RemoteToolsError('REMOTE_TOOLS_EXEC_CANCELED'));
		});
		const timer =
			timeoutMs === null
				? undefined
				: setTimeout(() => fail(new RemoteToolsError('REMOTE_TOOLS_EXEC_TIMEOUT')), timeoutMs);
		timer?.unref();

		function cleanup(): void {
			settled = true;
			clearTimeout(timer);
			abort[Symbol.dispose]();
		}

		function fail(cause: unknown): void {
			if (settled) return;
			cleanup();
			channel?.destroy();
			result.reject(cause);
		}

		function receive(chunk: Buffer, stderr: boolean): void {
			if (settled) return;
			try {
				onOutput(chunk, stderr);
			} catch (cause) {
				fail(cause);
			}
		}

		void this.connection
			.exec(command)
			.then((stream) => {
				channel = stream;
				stream.on('error', fail);
				stream.stderr.on('error', fail);
				if (settled) {
					stream.destroy();
					return;
				}

				stream.on('data', (chunk: Buffer) => receive(chunk, false));
				stream.stderr.on('data', (chunk: Buffer) => receive(chunk, true));
				stream.once('exit', (code: number | null, reason?: string) => {
					exit = { code: code ?? null, signal: reason };
				});
				stream.once('close', (code?: number | null, reason?: string) => {
					if (settled) return;
					cleanup();
					// ssh2 的 close 同样携带退出状态，短命令可能先于监听器收到 exit。
					result.resolve(exit ?? { code: code ?? null, signal: reason });
				});
			}, fail)
			.catch(fail);

		return result.promise;
	}
}

type CommandExit = Pick<RemoteCommandResult, 'code' | 'signal'>;
