import { createWorkspaceTransfers } from './workspace-transfers';
import type { FileTransfer } from '../shared/workspace-file-operation-types';
import { randomUUID, createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { addAbortListener, EventEmitter } from 'node:events';
import { Terminal } from '@xterm/headless';
import { SerializeAddon } from '@xterm/addon-serialize';
import type { Terminal as BrowserTerminal } from '@xterm/xterm';
import type { WebSocket } from 'ws';
import type { ClientChannel } from 'ssh2';
import type { SshApi, SshConnectionApi } from '@nexus-terminal/ssh/ssh-api';
import type { ConnectionsApi } from '@nexus-terminal/connections/connections-api';
import type { CredentialsApi } from '@nexus-terminal/credentials/credentials-api';
import type { PluginDatabaseApi } from 'nexus-terminal/node';
import { TerminalInputSchema, type SessionCreate, type SessionInfo } from '../shared/workspace-types';
import type { WorkspaceSessionPresentation } from '../shared/workspace-layout-types';
import { WorkspaceStorage } from './workspace-storage.js';
import { WorkspaceSessionScope } from './workspace-session-scope.js';
import { WorkspaceError, describeWorkspaceError } from './workspace-error';

export { WorkspaceError } from './workspace-error';

import type { RemoteToolsApi, RemoteToolsSessionApi } from '@nexus-terminal/remote-tools/remote-tools-api';
import { createWorkspaceStatus } from './workspace-status';
import type { PluginLogApi } from 'nexus-terminal/node';
import { createWorkspaceFiles } from './workspace-files';
import { createWorkspaceDirectory } from './workspace-directory';
import { createTerminalBackpressure } from './terminal-backpressure';
interface Session {
	scope: WorkspaceSessionScope;
	serverIdentity: string;
	endpoint: {
		host: string;
		port: number;
		username: string;
		credentialId: string;
		hostKey: Buffer;
		fingerprint: string;
	};
	info: SessionInfo;
	connection: SshConnectionApi;
	channel: ClientChannel;
	terminal: Terminal;
	serialize: SerializeAddon;
	socket?: WebSocket;
	attaching?: WebSocket;
	timer?: ReturnType<typeof setTimeout>;
	queue: Promise<void>;
	output: ReturnType<typeof createTerminalBackpressure>;
	closed: boolean;
	terminalClosed: boolean;
	suspending: boolean;
	remote: RemoteToolsSessionApi;
	status: ReturnType<typeof createWorkspaceStatus>;
	directory: ReturnType<typeof createWorkspaceDirectory>;
	files: ReturnType<typeof createWorkspaceFiles>;
}

/** Sessions survive the frontend only after explicit suspend. Abnormal disconnect gets a 10-second reconnect grace; ordinary close destroys immediately. */
export class WorkspaceService {
	readonly #storage: WorkspaceStorage;
	readonly #sessions = new Map<string, Session>();
	readonly #events = new EventEmitter();
	readonly #closing = new Map<string, Promise<void>>();
	readonly transfers: ReturnType<typeof createWorkspaceTransfers>;
	#creating = 0;

	constructor(
		database: PluginDatabaseApi,
		private readonly connections: ConnectionsApi,
		private readonly credentials: CredentialsApi,
		private readonly ssh: SshApi,
		private readonly signal: AbortSignal,
		private readonly log: PluginLogApi,
		private readonly remoteTools: RemoteToolsApi,
	) {
		this.#storage = new WorkspaceStorage(database);
		this.#events.setMaxListeners(0);
		this.transfers = createWorkspaceTransfers(signal, (task) =>
			log.report({
				level: task.state === 'failed' || task.state === 'unknown' ? 'error' : 'info',
				code: 'WORKSPACE_TRANSFER_STATE_CHANGED',
				params: { taskId: task.id, kind: task.kind, state: task.state, method: task.method ?? '' },
			}),
		);
	}

	#changed(): void {
		for (const fn of this.#events.listeners('change')) {
			try {
				fn();
			} catch {}
		}
	}

	#get(id: string): Session {
		this.signal.throwIfAborted();
		const s = this.#sessions.get(id);
		if (!s || s.closed) throw new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 404);
		return s;
	}

	list() {
		this.signal.throwIfAborted();
		return [...this.#sessions.values()].map((s) => ({ ...s.info }));
	}

	close(id: string): Promise<void> {
		const existing = this.#closing.get(id);
		if (existing) return existing;
		const s = this.#sessions.get(id);
		if (!s || s.closed) return Promise.resolve();
		s.closed = true;
		this.#sessions.delete(id);
		clearTimeout(s.timer);
		const cleanup = Promise.resolve().then(async () => {
			const failures: unknown[] = [];

			async function release(work: () => unknown | Promise<unknown>) {
				try {
					await work();
				} catch (cause) {
					failures.push(cause);
				}
			}

			await release(() => s.output.dispose());
			await release(() => s.socket?.close(1000));
			await release(() => s.attaching?.close(1000));
			// Transfer rollback may still need SSH/SFTP. Preserve that ordering even
			// when a prior release fails, and never skip the final connection close.
			await release(() => this.transfers.cancelSession(id));
			await release(() => s.status.dispose());
			await release(() => s.directory.close());
			await release(() => s.scope.close());
			await release(() => s.files.dispose());
			await release(() => s.channel.destroy());
			await release(() => s.terminal.dispose());
			await release(() => s.connection.close());
			if (failures.length) throw new AggregateError(failures, 'WORKSPACE_SESSION_CLOSE_FAILED');
		});
		this.#closing.set(id, cleanup);
		void cleanup
			.then(
				() => this.#closing.delete(id),
				(cause) => {
					this.#closing.delete(id);
					this.log.report({
						level: 'error',
						code: 'WORKSPACE_SESSION_CLOSE_FAILED',
						params: {
							causeCode: String(
								describeWorkspaceError(cause, 'close', 'WORKSPACE_SESSION_CLOSE_FAILED').code,
							),
						},
					});
				},
			)
			.catch(() => {
				/* A log sink must not turn background cleanup into an unhandled rejection. */
			});
		// State means no longer callable; disposal can continue after this notification.
		this.#changed();
		return cleanup;
	}

	#closeInBackground(id: string) {
		// close already reports cleanup failures; event callbacks have no caller
		// to receive its rejection, unlike an awaited HTTP close operation.
		void this.close(id).catch(() => {});
	}

	#grace(s: Session) {
		clearTimeout(s.timer);
		s.timer = setTimeout(() => {
			this.#closeInBackground(s.info.id);
		}, 10000);
		s.timer.unref();
	}

	async create(input: SessionCreate, requestSignal?: AbortSignal) {
		const lifetime = requestSignal ? AbortSignal.any([this.signal, requestSignal]) : this.signal;
		lifetime.throwIfAborted();
		if (this.#sessions.size + this.#creating >= 16) throw new WorkspaceError('WORKSPACE_SESSION_LIMIT', 409);
		this.#creating++;
		let connection: SshConnectionApi | undefined;
		const sessionScope = new WorkspaceSessionScope();
		const connectionLifetime = new AbortController();
		using cancelCreation = addAbortListener(lifetime, () => connectionLifetime.abort(lifetime.reason));
		let channel: Awaited<ReturnType<SshConnectionApi['shell']>> | undefined;
		let terminal: Terminal | undefined;
		let sessionId: string | undefined;
		try {
			const config = await this.connections.get(input.connectionId);
			if (!config || config.type !== 'ssh') throw new WorkspaceError('WORKSPACE_CONNECTION_REQUIRED', 409);
			if (!config.credentialId) throw new WorkspaceError('WORKSPACE_CREDENTIAL_REQUIRED', 409);
			lifetime.throwIfAborted();
			const auth = await this.credentials.resolve(config.credentialId);
			const known = await this.#storage.getHostKey(config.host, config.port);
			lifetime.throwIfAborted();
			let observed: string | undefined;
			let hostKey: Buffer | undefined;
			try {
				connection = await this.ssh.connect({
					host: config.host,
					port: config.port,
					username: auth.username,
					...(auth.type === 'password'
						? { password: auth.password }
						: { privateKey: auth.privateKey, passphrase: auth.passphrase ?? undefined }),
					keepaliveInterval: 15000,
					keepaliveCountMax: 3,
					readyTimeout: 20000,
					signal: connectionLifetime.signal,

					hostVerifier(key: Buffer) {
						hostKey = Buffer.from(key);
						observed = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
						return observed === (input.hostKeyFingerprint ?? known?.fingerprint);
					},
				});
			} catch (cause) {
				lifetime.throwIfAborted();
				if (observed && observed !== (input.hostKeyFingerprint ?? known?.fingerprint))
					throw new WorkspaceError(
						known ? 'WORKSPACE_HOST_KEY_CHANGED' : 'WORKSPACE_HOST_KEY_CONFIRM',
						409,
						observed,
						known?.fingerprint,
					);
				throw cause;
			}
			lifetime.throwIfAborted();
			if (input.hostKeyFingerprint) {
				await this.#storage.saveHostKey(config.host, config.port, input.hostKeyFingerprint);
				lifetime.throwIfAborted();
			}
			channel = await connection.shell({
				pty: { term: 'xterm-256color', cols: 80, rows: 24 },
			});
			lifetime.throwIfAborted();
			terminal = new Terminal({
				cols: 80,
				rows: 24,
				scrollback: 2000,
				allowProposedApi: true,
			});
			const serialize = new SerializeAddon();
			serialize.activate(terminal as unknown as BrowserTerminal);
			const remote = this.remoteTools.bind(connection, sessionScope);
			const s: Session = {
				serverIdentity: JSON.stringify([config.host.toLowerCase(), config.port, observed, auth.username]),
				endpoint: {
					host: config.host,
					port: config.port,
					username: auth.username,
					credentialId: config.credentialId,
					hostKey: hostKey!,
					fingerprint: observed!,
				},
				info: {
					id: randomUUID(),
					connectionId: config.id,
					name: config.name,
					state: 'disconnected',
					terminal: 'running',
					transfers: 0,
					createdAt: Date.now(),
				},
				connection,
				channel,
				terminal,
				serialize,
				queue: Promise.resolve(),
				output: createTerminalBackpressure(channel, () => s.socket),
				closed: false,
				terminalClosed: false,
				suspending: false,
				remote,
				scope: sessionScope,
				directory: createWorkspaceDirectory(remote, channel),
				status: createWorkspaceStatus(remote, this.log),
				files: createWorkspaceFiles(connection, (count) => {
					s.info.transfers = count;
					this.#changed();
				}),
			};
			this.#sessions.set(s.info.id, s);
			sessionId = s.info.id;
			this.#grace(s);
			const decoder = new StringDecoder('utf8');

			const output = (text: string) => {
				if (!text || s.closed) return;
				s.output.parsing(true);
				s.queue = s.queue
					.then(
						() =>
							new Promise<void>((resolve) => {
								if (s.closed) return resolve();
								s.terminal.write(text, () => {
									const socket = s.socket;
									if (socket?.readyState === 1) {
										// Only terminal bytes use binary frames. Snapshot/control messages remain JSON.
										// Decode before re-encoding so an attachment never starts mid UTF-8 character.
										socket.send(Buffer.from(text, 'utf8'), (cause) => {
											if (cause && socket.readyState === 1) socket.terminate();
										});
									}
									resolve();
									s.output.parsing(false);
								});
							}),
					)
					.catch(() => {
						this.#closeInBackground(s.info.id);
					});
			};

			channel.on('data', (bytes: Buffer) => {
				output(decoder.write(s.directory.filterOutput(bytes)));
			});

			const terminalClosed = () => {
				if (s.closed || s.terminalClosed) return;
				output(decoder.end());
				s.terminalClosed = true;
				s.info.terminal = 'closed';
				s.queue = s.queue.then(() => {
					s.output.dispose();
					if (s.socket?.readyState === 1) s.socket.send(JSON.stringify({ type: 'closed' }));
				});
				this.#changed();
			};

			channel.once('close', terminalClosed);
			channel.once('error', terminalClosed);
			connection.onStateChange((state) => {
				if (state.state === 'closed' || state.state === 'failed') this.#closeInBackground(s.info.id);
			});
			this.#changed();
			return { ...s.info };
		} catch (cause) {
			if (sessionId) await this.close(sessionId).catch(() => {});
			else {
				// Partial initialization has not published a session yet. Release every
				// acquired resource, preserving the original initialization failure.
				for (const release of [
					() => sessionScope.close(),
					() => channel?.destroy(),
					() => terminal?.dispose(),
					() => connection?.close(),
				]) {
					try {
						await release();
					} catch (cleanupError) {
						this.log.report({
							level: 'error',
							code: 'WORKSPACE_SESSION_CLOSE_FAILED',
							params: {
								causeCode: String(
									describeWorkspaceError(cleanupError, 'close', 'WORKSPACE_SESSION_CLOSE_FAILED')
										.code,
								),
							},
						});
					}
				}
			}
			throw cause;
		} finally {
			this.#creating--;
		}
	}

	async attach(id: string, socket: WebSocket) {
		const s = this.#get(id);
		if (s.suspending || s.socket?.readyState === 1 || s.attaching)
			throw new WorkspaceError('WORKSPACE_ALREADY_ATTACHED', 409);
		clearTimeout(s.timer);
		s.attaching = socket;
		// Subscribe to close before waiting for terminal serialization, including callers that leave immediately.
		socket.once('close', (code) => {
			if (s.attaching === socket) {
				s.attaching = undefined;
				if (!s.closed) {
					if (code === 1000) this.#closeInBackground(id);
					else this.#grace(s);
				}
				return;
			}
			if (s.socket !== socket) return;
			s.socket = undefined;
			s.output.check();
			s.directory.release();
			s.status.stop();
			if (s.closed || s.info.state === 'suspended') return;
			if (code === 1000) {
				this.#closeInBackground(id);
				return;
			}
			s.info.state = 'disconnected';
			this.#grace(s);
			this.#changed();
		});
		s.queue = s.queue.then(() => {
			s.attaching = undefined;
			if (s.closed || socket.readyState !== 1) return;
			s.socket = socket;
			s.info.state = 'attached';
			socket.send(
				JSON.stringify({
					type: 'snapshot',
					data: s.serialize.serialize(),
					closed: s.terminalClosed,
					cols: s.terminal.cols,
					rows: s.terminal.rows,
				}),
			);
			s.output.check();
			this.#changed();
		});
		await s.queue;
		if (socket.readyState !== 1) {
			if (!s.closed) this.#grace(s);
			return;
		}
		socket.on('message', (data, binary) => {
			if (s.closed || s.socket !== socket) return;
			let value;
			try {
				value = TerminalInputSchema.parse(JSON.parse(data.toString()));
			} catch {
				socket.close(1008);
				return;
			}
			if (binary) {
				socket.close(1008);
				return;
			}
			if (value.type === 'close') {
				this.#closeInBackground(id);
				return;
			}
			if (s.terminalClosed) return;
			if (value.type === 'input') {
				s.directory.noteUserInput();
				if (!s.channel.write(value.data)) {
					socket.pause();
					s.channel.once('drain', () => socket.resume());
				}
			} else {
				s.queue = s.queue
					.then(() => {
						if (!s.closed) {
							s.terminal.resize(value.cols, value.rows);
							s.channel.setWindow(value.rows, value.cols, 0, 0);
						}
					})
					.catch(() => {
						this.#closeInBackground(id);
					});
			}
		});
		let alive = true;
		socket.on('pong', () => {
			alive = true;
		});
		const heartbeat = setInterval(() => {
			if (!alive) {
				socket.terminate();
				return;
			}
			alive = false;
			if (socket.readyState === 1) socket.ping();
		}, 15000);
		heartbeat.unref();
		socket.once('close', () => clearInterval(heartbeat));
	}

	async suspend(id: string, presentation?: WorkspaceSessionPresentation) {
		const s = this.#get(id);
		if (s.attaching || s.suspending) throw new WorkspaceError('WORKSPACE_SESSION_BUSY', 409);
		s.suspending = true;
		s.info.state = 'suspended';
		s.status.stop();
		clearTimeout(s.timer);
		try {
			await this.transfers.cancelSession(id);
			await s.files.cancelTransfers();
			if (s.closed) throw new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 404);
			if (presentation) s.info.presentation = presentation;
			s.socket?.close(1000);
			s.socket = undefined;
			s.output.check();
			this.#changed();
			return { ...s.info };
		} finally {
			s.suspending = false;
		}
	}

	async dispose(): Promise<void> {
		const releases = [...this.#sessions.keys()].map((id) => this.close(id));
		await Promise.allSettled([...releases, ...this.#closing.values()]);
		try {
			await this.transfers.dispose();
		} finally {
			this.#events.removeAllListeners();
		}
	}

	async startFileTransfer(destinationId: string, input: FileTransfer) {
		const from = this.#get(input.sourceSessionId),
			to = this.#get(destinationId);
		// Fast root-level conflict check preserves the existing explicit overwrite confirmation.
		if (!input.overwrite) {
			const target = await to.files.list(input.destination);
			if (
				input.paths.some((path) =>
					target.entries.some((entry) => entry.name === path.split('/').pop() && entry.kind !== 'directory'),
				)
			)
				throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
		}
		return this.transfers.start(
			{
				kind: input.move ? 'move' : 'copy',
				label: input.paths[0].split('/').pop() ?? '',
				source: from.info.name,
				destination: to.info.name,
				paths: input.paths,
				destinationPath: input.destination,
				sessionIds: [...new Set([from.info.id, to.info.id])],
			},
			async (progress, overwrite) => {
				const source = this.#get(input.sourceSessionId),
					destination = this.#get(destinationId);
				if (source.info.state === 'suspended' || destination.info.state === 'suspended')
					throw new WorkspaceError('WORKSPACE_SESSION_SUSPENDED', 409);
				const sameServer = source.serverIdentity === destination.serverIdentity;
				await source.files.transferTo(
					destination.files,
					{ ...input, overwrite: input.overwrite || overwrite },
					progress.signal,
					sameServer,
					progress,
					async (stage, paths, filesOnly, onProgress) => {
						// Resolve credentials only for this execution, never retain them in task history.
						const target = sameServer ? undefined : destination.endpoint;
						const authentication = target ? await this.credentials.resolve(target.credentialId) : undefined;
						if (authentication && authentication.username !== target!.username)
							throw new WorkspaceError('WORKSPACE_CREDENTIAL_REQUIRED', 409);
						return source.remote.copyFiles(
							{
								paths,
								destination: stage,
								filesOnly,
								...(target && authentication
									? {
											target: {
												...target,
												hostKey: Uint8Array.from(target.hostKey),
												authentication:
													authentication.type === 'password'
														? {
																type: 'password' as const,
																password: authentication.password,
															}
														: {
																type: 'key' as const,
																privateKey: authentication.privateKey,
																passphrase: authentication.passphrase,
															},
											},
										}
									: {}),
							},
							{
								signal: progress.signal,
								onProgress,

								onMethod: (method) => progress.update({ state: 'transferring', method }),
							},
						);
					},
				);
			},
			{ retryable: true },
		).task;
	}

	attachStatus(id: string, socket: WebSocket): void {
		const session = this.#get(id);
		if (session.info.state !== 'attached') throw new WorkspaceError('WORKSPACE_SESSION_SUSPENDED', 409);
		session.status.attach(socket);
	}

	sessionFiles(id: string) {
		const session = this.#get(id);
		if (session.info.state === 'suspended') throw new WorkspaceError('WORKSPACE_SESSION_SUSPENDED', 409);
		return {
			name: session.info.name,
			files: session.files,
			remote: session.remote,
			directory: session.directory,
		};
	}

	files(id: string) {
		return this.sessionFiles(id).files;
	}

	subscribe(fn: () => void) {
		this.#events.on('change', fn);
		return () => {
			this.#events.off('change', fn);
		};
	}
}
