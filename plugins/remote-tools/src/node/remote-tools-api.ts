import type { RemoteShellOptions } from './remote-shell-types.js';
import type {
	RemoteTransferInput,
	RemoteTransferResult,
	RemoteTransferMethod,
} from '../shared/remote-transfer-types.js';
import type { SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type {
	RemoteCommand,
	RemoteCommandResult,
	RemoteEnvironment,
	ServerStatus,
} from '../shared/remote-tools-types.js';
import type { PluginScopeApi } from 'nexus-terminal/node';
import type { ArchiveInput, ExtractInput } from '../shared/remote-file-types.js';

import { RemoteToolsSession } from './remote-tools-session.js';
import { RemoteToolsError } from './remote-tools-error.js';

export type { RemoteToolsError, RemoteCommandError } from './remote-tools-error.js';

/** Owns only the prompt integration, never the caller's PTY or SSH connection. */
export interface RemoteShellApi {
	readonly isAtPrompt: boolean;
	currentDirectory(signal?: AbortSignal): Promise<string>;
	resolveDirectory(path: string, signal?: AbortSignal): Promise<string>;
	ensureHook(): Promise<void>;
	changeDirectory(path: string): void;
	filterOutput(bytes: Uint8Array): Uint8Array;
	noteUserInput(): void;
	onAttachmentReleased(): void;
	close(): void;
}

export interface RemoteArchiveApi {
	compress(input: ArchiveInput, options?: { signal?: AbortSignal }): Promise<void>;
	extract(input: ExtractInput, options?: { signal?: AbortSignal }): Promise<void>;
}

export interface RemoteToolsApi {
	/** Bind an existing trusted SSH connection. Disposing this binding never closes the caller's SSH connection. */
	bind(connection: SshConnectionApi, scope: PluginScopeApi): RemoteToolsSessionApi;
}

export interface RemoteToolsSessionApi {
	readonly archives: RemoteArchiveApi;
	/** Copies to a private caller-owned stage; never publishes or retries. Unavailable means no copy command ran. */
	copyFiles(
		input: RemoteTransferInput,
		options?: {
			signal?: AbortSignal;
			onProgress?: (bytes: number) => void;
			onMethod?: (method: RemoteTransferMethod) => void;
		},
	): Promise<RemoteTransferResult>;
	/** Install before forwarding user input. Foreground applications are never probed. */
	openShell(options: Omit<RemoteShellOptions, 'execute'>): RemoteShellApi;
	/** POSIX argv quoting; no local process is spawned. Explicit sh -c is caller-owned shell code.
	 * stdout/stderr may contain secrets: do not forward them to diagnostics automatically.
	 * Nonzero exit codes are returned unchanged; code=null means no confirmed exit.
	 * Abort/timeout destroys only the exec channel, not SSH, and cannot promise to kill the remote process.
	 * No automatic retries. null timeout permits a caller-managed indefinite operation.
	 */
	execute(command: RemoteCommand, options?: { signal?: AbortSignal }): Promise<RemoteCommandResult>;
	/** Checks command availability; never installs tools or elevates privileges. POSIX shell required. */
	inspect(tools?: readonly string[], options?: { signal?: AbortSignal }): Promise<RemoteEnvironment>;
	/** Linux procfs + df. First sample has no CPU/network rate; quantities use bytes. */
	getStatus(options?: { signal?: AbortSignal }): Promise<ServerStatus>;
	resetStatus(): void;
	/** Idempotently stop accepting work and wait for owned operations to release their resources. */
	close(): Promise<void>;
}

declare module 'nexus-terminal/node' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/remote-tools': { readonly remoteTools: RemoteToolsApi };
	}
}

/** SSH 和 Remote Tools 的依赖绑定都由宿主管理。 */
export class RemoteTools implements RemoteToolsApi {
	constructor(private readonly provider: PluginScopeApi) {}

	bind(connection: SshConnectionApi, scope: PluginScopeApi): RemoteToolsSessionApi {
		if (this.provider.signal.aborted || scope.signal.aborted || connection.getState().state !== 'connected')
			throw new RemoteToolsError('REMOTE_TOOLS_EXEC_DISPOSED');

		const session = new RemoteToolsSession(connection, AbortSignal.any([this.provider.signal, scope.signal]));

		const stop = () => session.close();

		const unregister = this.provider.onDispose(stop);
		const unregisterOwner = scope.onDispose(stop);
		session.onClosed(() => {
			unregisterOwner();
			unregister();
		});
		return session;
	}
}
