import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { CredentialsApi } from '@nexus-terminal/credentials/credentials-api';
import type { PluginDatabaseApi } from 'nexus-terminal/node';
import {
	ConnectionInputSchema,
	type Connection,
	type ConnectionCatalog,
	type ConnectionInput,
} from '../shared/connection-types.js';
import type { ConnectionRow, ConnectionTables } from './connections-sql.js';

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

function summary({ created_at, updated_at, credential_id, ...row }: ConnectionRow, tags: string[]): Connection {
	return { ...row, credentialId: credential_id, createdAt: created_at, updatedAt: updated_at, tags };
}

export class Connections implements ConnectionsApi {
	#revision = 0;

	readonly #database: PluginDatabaseApi;
	readonly #credentials: CredentialsApi;
	readonly #signal: AbortSignal;
	readonly #publish: (revision: number) => void;

	constructor(
		database: PluginDatabaseApi,
		credentials: CredentialsApi,
		signal: AbortSignal,
		publish: (revision: number) => void,
	) {
		this.#database = database;
		this.#credentials = credentials;
		this.#signal = signal;
		this.#publish = publish;
	}

	async list(): Promise<ConnectionCatalog> {
		this.#signal.throwIfAborted();
		const catalog = await this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute(async (transaction) => {
					const rows = await transaction
						.selectFrom('connections')
						.selectAll()
						.orderBy('name')
						.orderBy('id')
						.execute();
					const tags = await transaction.selectFrom('tags').select(['id', 'name']).orderBy('name').execute();
					const references = await transaction.selectFrom('connection_tags').selectAll().execute();
					const names = new Map(tags.map(({ id, name }) => [id, name]));
					const grouped = new Map<string, string[]>();
					const counts = new Map<string, number>();

					for (const { connection_id, tag_id } of references) {
						const name = names.get(tag_id);
						if (name === undefined) continue;
						const list = grouped.get(connection_id) ?? [];
						list.push(name);
						grouped.set(connection_id, list);
						counts.set(tag_id, (counts.get(tag_id) ?? 0) + 1);
					}

					return {
						connections: rows.map((row) => summary(row, (grouped.get(row.id) ?? []).sort())),
						tags: tags.map((tag) => ({ ...tag, count: counts.get(tag.id) ?? 0 })),
					};
				}),
		);
		this.#signal.throwIfAborted();
		return catalog;
	}

	async get(id: string): Promise<Connection | undefined> {
		this.#signal.throwIfAborted();
		const value = await this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute((transaction) => this.#read(transaction, id)),
		);
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
		await this.#credentials.withReference('@nexus-terminal/connections', id, null, () =>
			this.#database.withClient((db) =>
				db
					.$extendTables<ConnectionTables>()
					.transaction()
					.execute(async (transaction) => {
						this.#assertActive(signal);
						await transaction.deleteFrom('connection_tags').where('connection_id', '=', id).execute();
						const result = await transaction
							.deleteFrom('connections')
							.where('id', '=', id)
							.executeTakeFirst();
						if (!result.numDeletedRows) throw new ConnectionError('CONNECTIONS_NOT_FOUND');
					}),
			),
		);
		this.#changed();
	}

	async removeTag(id: string, signal?: AbortSignal): Promise<void> {
		this.#assertActive(signal);
		await this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute(async (transaction) => {
					this.#assertActive(signal);
					const links = await transaction
						.selectFrom('connection_tags')
						.select('connection_id')
						.where('tag_id', '=', id)
						.execute();
					if (links.length)
						await transaction
							.updateTable('connections')
							.set({ updated_at: Date.now() })
							.where(
								'id',
								'in',
								links.map(({ connection_id }) => connection_id),
							)
							.execute();

					await transaction.deleteFrom('connection_tags').where('tag_id', '=', id).execute();
					const result = await transaction.deleteFrom('tags').where('id', '=', id).executeTakeFirst();
					if (!result.numDeletedRows) throw new ConnectionError('CONNECTIONS_TAG_NOT_FOUND');
				}),
		);
		this.#changed();
	}

	async #save(id: string, input: ConnectionInput, updating: boolean, signal?: AbortSignal): Promise<Connection> {
		this.#assertActive(signal);
		const parsed = ConnectionInputSchema.safeParse(input);
		if (!parsed.success) throw new ConnectionError('CONNECTIONS_INVALID_REQUEST');
		const { tags, credentialId, ...fields } = parsed.data;
		const saved = await this.#credentials.withReference(
			'@nexus-terminal/connections',
			id,
			credentialId,
			() =>
				this.#database.withClient((db) =>
					db
						.$extendTables<ConnectionTables>()
						.transaction()
						.execute(async (transaction) => {
							this.#assertActive(signal);
							const now = Date.now();
							const value = { ...fields, credential_id: credentialId, updated_at: now };

							if (updating) {
								const updated = await transaction
									.updateTable('connections')
									.set(value)
									.where('id', '=', id)
									.executeTakeFirst();
								if (!updated.numUpdatedRows) throw new ConnectionError('CONNECTIONS_NOT_FOUND');
							} else {
								await transaction
									.insertInto('connections')
									.values({ ...value, id, created_at: now })
									.execute();
							}

							await this.#saveTags(transaction, id, tags);
							this.#assertActive(signal);
							const result = await this.#read(transaction, id);
							if (!result) throw new ConnectionError('CONNECTIONS_NOT_FOUND');
							return result;
						}),
				),
			AbortSignal.any(signal ? [signal, this.#signal] : [this.#signal]),
		);
		this.#changed();
		return saved;
	}

	async #saveTags(db: Kysely<ConnectionTables>, id: string, tags: string[]): Promise<void> {
		await db.deleteFrom('connection_tags').where('connection_id', '=', id).execute();
		const unique = new Map(tags.map((name) => [name.normalize('NFKC').trim().toLowerCase(), name]));
		for (const [normalized, name] of unique) {
			await db
				.insertInto('tags')
				.values({ id: randomUUID(), name, normalized })
				.onConflict((conflict) => conflict.column('normalized').doNothing())
				.execute();
			const tag = await db
				.selectFrom('tags')
				.select('id')
				.where('normalized', '=', normalized)
				.executeTakeFirstOrThrow();
			await db.insertInto('connection_tags').values({ connection_id: id, tag_id: tag.id }).execute();
		}
	}

	async #read(db: Kysely<ConnectionTables>, id: string): Promise<Connection | undefined> {
		const row = await db.selectFrom('connections').selectAll().where('id', '=', id).executeTakeFirst();
		if (!row) return undefined;
		const tags = await db
			.selectFrom('connection_tags')
			.innerJoin('tags', 'tags.id', 'connection_tags.tag_id')
			.select('tags.name')
			.where('connection_tags.connection_id', '=', id)
			.orderBy('tags.name')
			.execute();
		return summary(
			row,
			tags.map(({ name }) => name),
		);
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
