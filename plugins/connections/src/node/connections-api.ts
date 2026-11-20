import { randomUUID } from 'node:crypto';
import type { CredentialsApi } from '@nexus-terminal/credentials/credentials-api';
import type { PluginDatabaseApi } from 'nexus-terminal/node';
import {
	ConnectionInputSchema,
	type Connection,
	type ConnectionCatalog,
	type ConnectionInput,
} from '../shared/connection-types.js';
import { ConnectionsStorage } from './connections-storage.js';

export type { Connection, ConnectionCatalog, ConnectionInput } from '../shared/connection-types.js';

export type ConnectionErrorCode = 'CONNECTIONS_NOT_FOUND' | 'CONNECTIONS_TAG_NOT_FOUND' | 'CONNECTIONS_INVALID_REQUEST';

export class ConnectionError extends Error {
	override readonly name = 'ConnectionError';

	constructor(readonly code: ConnectionErrorCode) {
		super(code);
	}
}

/** 只管理连接配置。会话由使用这些配置的插件创建。 */
export interface ConnectionsApi {
	list(): Promise<ConnectionCatalog>;
	get(id: string): Promise<Connection | undefined>;
	create(input: ConnectionInput, signal?: AbortSignal): Promise<Connection>;
	update(id: string, input: ConnectionInput, signal?: AbortSignal): Promise<Connection>;
	remove(id: string, signal?: AbortSignal): Promise<void>;
	removeTag(id: string, signal?: AbortSignal): Promise<void>;
}

declare module 'nexus-terminal/node' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/connections': { readonly connections: ConnectionsApi };
	}
}

export class Connections implements ConnectionsApi {
	#revision = 0;

	readonly #storage: ConnectionsStorage;
	readonly #credentials: CredentialsApi;
	readonly #signal: AbortSignal;
	readonly #publish: (revision: number) => void;

	constructor(
		database: PluginDatabaseApi,
		credentials: CredentialsApi,
		signal: AbortSignal,
		publish: (revision: number) => void,
	) {
		this.#storage = new ConnectionsStorage(database);
		this.#credentials = credentials;
		this.#signal = signal;
		this.#publish = publish;
	}

	async list(): Promise<ConnectionCatalog> {
		this.#signal.throwIfAborted();
		const catalog = await this.#storage.list();
		this.#signal.throwIfAborted();
		return catalog;
	}

	async get(id: string): Promise<Connection | undefined> {
		this.#signal.throwIfAborted();
		const value = await this.#storage.get(id);
		this.#signal.throwIfAborted();
		return value;
	}

	create(input: ConnectionInput, signal?: AbortSignal): Promise<Connection> {
		return this.#save(randomUUID(), input, false, signal);
	}

	update(id: string, input: ConnectionInput, signal?: AbortSignal): Promise<Connection> {
		return this.#save(id, input, true, signal);
	}

	async remove(id: string, signal?: AbortSignal): Promise<void> {
		this.#assertActive(signal);
		const lifetime = signal ? AbortSignal.any([this.#signal, signal]) : this.#signal;
		await this.#credentials.withReference('@nexus-terminal/connections', id, null, async () => {
			if (!(await this.#storage.remove(id, lifetime))) throw new ConnectionError('CONNECTIONS_NOT_FOUND');
		});
		this.#changed();
	}

	async removeTag(id: string, signal?: AbortSignal): Promise<void> {
		this.#assertActive(signal);
		const lifetime = signal ? AbortSignal.any([this.#signal, signal]) : this.#signal;
		if (!(await this.#storage.removeTag(id, lifetime))) throw new ConnectionError('CONNECTIONS_TAG_NOT_FOUND');
		this.#changed();
	}

	async #save(id: string, input: ConnectionInput, updating: boolean, signal?: AbortSignal): Promise<Connection> {
		this.#assertActive(signal);
		const parsed = ConnectionInputSchema.safeParse(input);
		if (!parsed.success) throw new ConnectionError('CONNECTIONS_INVALID_REQUEST');
		const lifetime = signal ? AbortSignal.any([this.#signal, signal]) : this.#signal;
		const saved = await this.#credentials.withReference(
			'@nexus-terminal/connections',
			id,
			parsed.data.credentialId,
			async () => {
				const result = await this.#storage.save(id, parsed.data, updating, lifetime);
				if (!result) throw new ConnectionError('CONNECTIONS_NOT_FOUND');
				return result;
			},
			lifetime,
		);
		this.#changed();
		return saved;
	}

	#assertActive(signal?: AbortSignal): void {
		this.#signal.throwIfAborted();
		signal?.throwIfAborted();
	}

	#changed(): void {
		const revision = ++this.#revision;
		if (!this.#signal.aborted) this.#publish(revision);
	}
}
