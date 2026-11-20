import type { RemoteToolsSessionApi } from '@nexus-terminal/remote-tools/remote-tools-api';
import type { ClientChannel } from 'ssh2';
import { WorkspaceError } from './workspace-error';

/** The legacy prompt-safe directory queue. A newer request replaces an unsent request.
 * Cancellation only stops waiting; an already submitted cd is never "rolled back".
 */
export function createWorkspaceDirectory(remote: RemoteToolsSessionApi, channel: ClientChannel) {
	let pending:
		| {
				path: string;
				expected: string;
				sent: boolean;
				resolve(value: { path: string }): void;
				reject(cause: unknown): void;
				timer: ReturnType<typeof setTimeout>;
				cleanup(): void;
		  }
		| undefined;
	let closed = false;
	let generation = 0;
	const shell = remote.openShell({
		write: (bytes) => {
			if (!closed) channel.write(bytes);
		},

		onPrompt: prompt,
	});
	const initialized = shell.ensureHook();
	// Unsupported shells keep their ordinary PTY; directory actions report the original failure on demand.
	void initialized.catch(() => {});

	function finish(cause?: unknown, path?: string) {
		const task = pending;
		if (!task) return;
		pending = undefined;
		clearTimeout(task.timer);
		task.cleanup();
		if (cause) task.reject(cause);
		else task.resolve({ path: path! });
	}

	function prompt() {
		const task = pending;
		if (!task || closed) return;
		if (!task.sent) {
			task.sent = true;
			try {
				shell.changeDirectory(task.path);
			} catch (cause) {
				finish(cause);
			}
			return;
		}
		void shell.currentDirectory().then(
			(path) => {
				if (pending === task)
					finish(
						path === task.expected ? undefined : new WorkspaceError('WORKSPACE_DIRECTORY_UNCHANGED', 409),
						path,
					);
			},
			(cause) => {
				if (pending === task) finish(cause);
			},
		);
	}

	return {
		filterOutput: (bytes: Buffer) => Buffer.from(shell.filterOutput(bytes)),

		noteUserInput: () => shell.noteUserInput(),

		release() {
			generation++;
			finish(new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 409));
			shell.onAttachmentReleased();
		},

		async read(signal?: AbortSignal) {
			await initialized;
			signal?.throwIfAborted();
			return { path: await shell.currentDirectory(signal) };
		},

		async change(path: string, signal: AbortSignal) {
			const request = ++generation;
			finish(new WorkspaceError('WORKSPACE_DIRECTORY_REPLACED', 409));
			if (!path.startsWith('/') || /[\x00-\x1f\x7f-\x9f]/u.test(path))
				throw new WorkspaceError('WORKSPACE_INVALID_REQUEST');
			await initialized;
			signal.throwIfAborted();
			const expected = await shell.resolveDirectory(path, signal);
			if (request !== generation) throw new WorkspaceError('WORKSPACE_DIRECTORY_REPLACED', 409);
			signal.throwIfAborted();
			if (closed) throw new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 409);
			finish(new WorkspaceError('WORKSPACE_DIRECTORY_REPLACED', 409));
			return new Promise<{ path: string }>((resolve, reject) => {
				const abort = () => finish(new WorkspaceError('WORKSPACE_DIRECTORY_CANCELED', 409));

				pending = {
					path,
					expected,
					sent: false,
					resolve,
					reject,
					timer: setTimeout(
						() => finish(new WorkspaceError('WORKSPACE_DIRECTORY_PROMPT_TIMEOUT', 409)),
						30000,
					),

					cleanup: () => signal.removeEventListener('abort', abort),
				};
				pending.timer.unref();
				signal.addEventListener('abort', abort, { once: true });
				if (shell.isAtPrompt) prompt();
			});
		},

		close() {
			generation++;
			closed = true;
			finish(new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 409));
			shell.close();
		},
	};
}
