import { addAbortListener } from 'node:events';
import type { PluginLogApi } from 'nexus-terminal/node';
import ssh2, {
	type ClientChannel,
	type ConnectConfig,
	type ExecOptions,
	type ParsedKey,
	type PseudoTtyOptions,
	type SFTPWrapper,
	type ShellOptions,
	type VerifyCallback,
} from 'ssh2';

import { SshConnection } from './ssh-connection.js';
import { SshError, type SshErrorCode } from './ssh-error.js';

export type { SshErrorCode } from './ssh-error.js';

export type SshConnectionState =
	{ state: 'connected' | 'closing' | 'closed' } | { state: 'failed'; code: SshErrorCode };

/** 保留 ssh2 的认证、算法与跳板选项。调用者明确提供主机校验策略。 */
export type SshConnectOptions = Omit<ConnectConfig, 'hostVerifier'> & {
	hostVerifier: NonNullable<ConnectConfig['hostVerifier']> | ((fingerprint: string, accept: VerifyCallback) => void);
	/** 取消会关闭本条连接及其通道。依赖消费者可传入 use 回调的 signal。 */
	signal?: AbortSignal;
};

export type SshShellOptions = ShellOptions & {
	/** false 不分配 PTY，省略时使用 ssh2 默认终端参数。 */
	pty?: PseudoTtyOptions | false;
};

export interface SshApi {
	/** 每次认证成功交付一条独立连接。传入 sock 时，将该跳板通道交给本次连接管理。 */
	connect(options: SshConnectOptions): Promise<SshConnectionApi>;
	/** 校验私钥格式及口令并返回单个解析后的私钥。 */
	parsePrivateKey(key: string | Buffer, passphrase?: string | Buffer): ParsedKey;
}

export interface SshConnectionApi {
	readonly id: string;

	getState(): Readonly<SshConnectionState>;

	/** 观察后续变化，当前值用 getState 读取。关闭后自动释放订阅。 */
	onStateChange(listener: (state: Readonly<SshConnectionState>) => void): () => void;

	/** 返回原生双向通道，支持 stderr、exit 和 setWindow。用完后可单独关闭。 */
	shell(options?: SshShellOptions): Promise<ClientChannel>;

	/** close 事件携带退出码或信号，也适用于在返回通道前已结束的短命令。 */
	exec(command: string, options?: ExecOptions): Promise<ClientChannel>;

	/** SFTP 客户端用完后可调用 end 单独关闭。 */
	sftp(): Promise<SFTPWrapper>;

	/** 返回 TCP 转发通道，也可作为下一次 connect 的 sock。 */
	forwardOut(
		sourceAddress: string,
		sourcePort: number,
		targetAddress: string,
		targetPort: number,
	): Promise<ClientChannel>;

	/** 幂等断开连接，等待底层确认关闭。 */
	close(): Promise<void>;
}

declare module 'nexus-terminal/node' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/ssh': { readonly ssh: SshApi };
	}
}

/** 宿主登记的 SSH 服务，跟踪本次激活期间创建的所有连接。 */
export class Ssh implements SshApi {
	readonly #connections = new Set<SshConnection>();
	readonly #abortSubscription: Disposable | undefined;
	#closing?: Promise<void>;

	constructor(
		private readonly signal: AbortSignal,
		private readonly log: PluginLogApi,
	) {
		if (!signal.aborted) this.#abortSubscription = addAbortListener(signal, () => void this.close());
	}

	async connect(options: SshConnectOptions) {
		this.#assertOpen();
		if (typeof options?.hostVerifier !== 'function') throw new SshError('SSH_INVALID_OPTIONS');
		if (options.signal?.aborted) throw new SshError('SSH_OPERATION_CANCELLED');

		const connection = new SshConnection(this.log, () => this.#connections.delete(connection));
		this.#connections.add(connection);
		return connection.connect(options, this.signal);
	}

	parsePrivateKey(key: string | Buffer, passphrase?: string | Buffer) {
		this.#assertOpen();
		const parsed = ssh2.utils.parseKey(key, passphrase);
		if (parsed instanceof Error) throw new SshError('SSH_PRIVATE_KEY_INVALID', { cause: parsed });

		const keys = Array.isArray(parsed) ? parsed : [parsed];
		if (keys.length !== 1 || !keys[0].isPrivateKey()) throw new SshError('SSH_PRIVATE_KEY_REQUIRED');
		return keys[0];
	}

	close(): Promise<void> {
		// 缓存清理任务后再通知连接。状态订阅者可能在通知期间再次调用 close。
		return (this.#closing ??= Promise.resolve().then(async () => {
			this.#abortSubscription?.[Symbol.dispose]();
			await Promise.all([...this.#connections].map((connection) => connection.close()));
		}));
	}

	#assertOpen(): void {
		if (this.signal.aborted || this.#closing) throw new SshError('SSH_PLUGIN_STOPPED');
	}
}
