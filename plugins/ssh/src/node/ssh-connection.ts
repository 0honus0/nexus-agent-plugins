import { randomUUID } from 'node:crypto';
import { addAbortListener } from 'node:events';
import { Socket } from 'node:net';
import type { PluginLogApi } from 'nexus-terminal/node';
import ssh2, { type ClientChannel, type ExecOptions, type SFTPWrapper } from 'ssh2';
import type { SshConnectOptions, SshConnectionApi, SshConnectionState, SshShellOptions } from './ssh-api.js';
import { SshError } from './ssh-error.js';

type Channel = ClientChannel | SFTPWrapper;

type HostVerifier = (key: Buffer | string, done: (accepted: boolean) => void) => boolean | void;

function connectionError(cause: Error & { level?: string }, hostRejected: boolean): SshError {
	if (hostRejected) return new SshError('SSH_HOST_KEY_REJECTED', { cause });
	switch (cause.level) {
		case 'client-authentication':
			return new SshError('SSH_AUTHENTICATION_FAILED', { cause });
		case 'client-timeout':
			return new SshError('SSH_CONNECTION_TIMEOUT', { cause });
		default:
			return new SshError('SSH_CONNECTION_FAILED', { cause });
	}
}

/** 每条连接拥有自己的传输、握手和通道。连接关闭后拒绝所有等待中的请求。 */
export class SshConnection implements SshConnectionApi {
	readonly id = randomUUID();
	readonly #client = new ssh2.Client();
	readonly #listeners = new Set<(state: Readonly<SshConnectionState>) => void>();
	readonly #pending = new Set<(error: SshError) => void>();
	readonly #closed = Promise.withResolvers<void>();
	#state: Readonly<SshConnectionState> = Object.freeze({ state: 'connected' });
	#transport?: NonNullable<SshConnectOptions['sock']>;
	#consumerAbort?: Disposable;
	#ready = false;
	#ended = false;
	#failure?: SshError;

	constructor(
		private readonly log: PluginLogApi,
		private readonly onClosed: () => void,
	) {}

	connect(options: SshConnectOptions, providerSignal: AbortSignal): Promise<SshConnectionApi> {
		const { promise, resolve, reject } = Promise.withResolvers<SshConnectionApi>();
		this.#pending.add(reject);

		try {
			const { signal, hostVerifier, ...config } = options;
			if (providerSignal.aborted || signal?.aborted) {
				this.#fail(new SshError(providerSignal.aborted ? 'SSH_PLUGIN_STOPPED' : 'SSH_OPERATION_CANCELLED'));
				return promise;
			}
			if (signal) {
				this.#consumerAbort = addAbortListener(signal, () =>
					this.#fail(new SshError('SSH_OPERATION_CANCELLED')),
				);
			}

			let hostRejected = false;
			this.#client.on('error', (cause) => this.#fail(connectionError(cause, hostRejected)));
			this.#client.once('ready', () => {
				if (!this.#pending.delete(reject)) return;
				this.#ready = true;
				this.log.report({ level: 'info', code: 'SSH_CONNECTED', params: { connectionId: this.id } });
				resolve(this);
			});

			// 持有 TCP socket，取消时也能中断尚在 DNS 解析或连接中的传输。
			const transport = config.sock ?? new Socket();
			if (transport.destroyed || transport.readableEnded) throw new SshError('SSH_CONNECTION_CLOSED');
			this.#transport = transport;
			transport.once('close', () => queueMicrotask(() => this.#finish()));
			if (!config.sock && transport instanceof Socket) {
				const family =
					config.forceIPv4 === config.forceIPv6 ? 0 : config.forceIPv4 ? 4 : config.forceIPv6 ? 6 : 0;
				transport.connect({
					host: config.host ?? 'localhost',
					port: config.port ?? 22,
					localAddress: config.localAddress,
					localPort: config.localPort,
					family,
				});
				transport.setNoDelay(true);
				transport.setTimeout(config.timeout ?? 0);
			}

			this.#client.connect({
				...config,
				sock: transport,

				hostVerifier: (key: Buffer | string, reply: (accepted: boolean) => void) => {
					let answered = false;

					const answer = (accepted: boolean) => {
						if (answered || this.#state.state !== 'connected') return;
						answered = true;
						hostRejected = accepted !== true;
						reply(!hostRejected);
					};

					try {
						const accepted = (hostVerifier as HostVerifier)(key, answer);
						if (typeof accepted === 'boolean') answer(accepted);
					} catch {
						answer(false);
					}
				},
			});
		} catch (cause) {
			this.#fail(cause instanceof SshError ? cause : new SshError('SSH_INVALID_OPTIONS', { cause }));
		}

		return promise;
	}

	getState(): Readonly<SshConnectionState> {
		return this.#state;
	}

	onStateChange(listener: (state: Readonly<SshConnectionState>) => void): () => void {
		if (!this.#ended) this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	shell({ pty = {}, ...options }: SshShellOptions = {}) {
		return this.#request<ClientChannel>((done) => this.#client.shell(pty, options, done));
	}

	exec(command: string, options: ExecOptions = {}) {
		return this.#request<ClientChannel>((done) => this.#client.exec(command, options, done));
	}

	sftp() {
		return this.#request<SFTPWrapper>((done) => this.#client.sftp(done));
	}

	forwardOut(sourceAddress: string, sourcePort: number, targetAddress: string, targetPort: number) {
		return this.#request<ClientChannel>((done) =>
			this.#client.forwardOut(sourceAddress, sourcePort, targetAddress, targetPort, done),
		);
	}

	close(): Promise<void> {
		if (!this.#ended && this.#state.state === 'connected') {
			this.#rejectPending(new SshError('SSH_CONNECTION_CLOSED'));
			this.#publish({ state: 'closing' });
			this.#stopTransport();
		}
		return this.#closed.promise;
	}

	#request<T extends Channel>(start: (done: (error: Error | undefined, channel: T) => void) => void): Promise<T> {
		if (!this.#ready || this.#state.state !== 'connected') return Promise.reject(this.#closedError());

		return new Promise<T>((resolve, reject) => {
			this.#pending.add(reject);

			try {
				start((error, channel) => {
					// 取消可能先于 ssh2 的回调。迟到的通道不能交给已结束的调用者。
					if (!this.#pending.delete(reject)) {
						channel?.destroy();
						return;
					}
					if (error) reject(new SshError('SSH_CHANNEL_FAILED', { cause: error }));
					else resolve(channel);
				});
			} catch (cause) {
				this.#pending.delete(reject);
				reject(new SshError('SSH_CHANNEL_FAILED', { cause }));
			}
		});
	}

	#fail(error: SshError): void {
		if (this.#state.state !== 'connected') return;
		this.#failure = error;
		this.#rejectPending(error);
		this.#publish({ state: 'failed', code: error.code });
		this.#stopTransport();
	}

	#stopTransport(): void {
		if (this.#transport) this.#transport.destroy();
		else this.#finish();
	}

	#finish(): void {
		if (this.#ended) return;
		this.#ended = true;
		this.#ready = false;
		this.#consumerAbort?.[Symbol.dispose]();
		this.#rejectPending(this.#closedError());
		if (!this.#failure) this.#publish({ state: 'closed' });
		this.#listeners.clear();
		this.onClosed();
		this.#closed.resolve();
	}

	#closedError(): SshError {
		return this.#failure ?? new SshError('SSH_CONNECTION_CLOSED');
	}

	#rejectPending(error: SshError): void {
		for (const reject of this.#pending) reject(error);
		this.#pending.clear();
	}

	#publish(state: SshConnectionState): void {
		const snapshot = Object.freeze(state);
		this.#state = snapshot;
		this.log.report({
			level: state.state === 'failed' ? 'warn' : 'info',
			code: state.state === 'failed' ? state.code : 'SSH_CONNECTION_' + state.state.toUpperCase(),
			params: { connectionId: this.id },
		});

		for (const listener of this.#listeners) {
			try {
				listener(snapshot);
			} catch {
				this.log.report({
					level: 'warn',
					code: 'SSH_STATE_LISTENER_FAILED',
					params: { connectionId: this.id },
				});
			}
		}
	}
}
