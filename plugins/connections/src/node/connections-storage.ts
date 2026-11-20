import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { BackupDeclaration, PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';
import type { Connection, ConnectionCatalog, ConnectionInput, ConnectionType } from '../shared/connection-types.js';

interface ConnectionRow {
	id: string;
	name: string;
	type: ConnectionType;
	host: string;
	port: number;
	credential_id: string | null;
	username: string;
	domain: string;
	notes: string;
	created_at: number;
	updated_at: number;
}

type ConnectionTables = {
	connections: ConnectionRow;
	tags: { id: string; name: string; normalized: string };
	connection_tags: { connection_id: string; tag_id: string };
};

export const migrations: NonNullable<PluginModuleApi['migrations']> = {
	async getMigrations() {
		return {
			'001_connections': {
				async up(db) {
					await db.schema
						.createTable('connections')
						.addColumn('id', 'text', (column) => column.primaryKey())
						.addColumn('name', 'text', (column) => column.notNull())
						.addColumn('type', 'text', (column) => column.notNull())
						.addColumn('host', 'text', (column) => column.notNull())
						.addColumn('port', 'integer', (column) => column.notNull())
						.addColumn('credential_id', 'text')
						.addColumn('username', 'text', (column) => column.notNull())
						.addColumn('domain', 'text', (column) => column.notNull())
						.addColumn('notes', 'text', (column) => column.notNull())
						.addColumn('created_at', 'integer', (column) => column.notNull())
						.addColumn('updated_at', 'integer', (column) => column.notNull())
						.execute();

					await db.schema
						.createTable('tags')
						.addColumn('id', 'text', (column) => column.primaryKey())
						.addColumn('name', 'text', (column) => column.notNull())
						.addColumn('normalized', 'text', (column) => column.notNull().unique())
						.execute();

					await db.schema
						.createTable('connection_tags')
						.addColumn('connection_id', 'text', (column) => column.notNull().references('connections.id'))
						.addColumn('tag_id', 'text', (column) => column.notNull().references('tags.id'))
						.addPrimaryKeyConstraint('connection_tags_pk', ['connection_id', 'tag_id'])
						.execute();

					await db.schema.createIndex('connection_tags_tag').on('connection_tags').column('tag_id').execute();
				},
			},
		};
	},
};

export const backup = [
	{
		table: 'connections',
		version: 1,
		keys: ['id'],
		fields: {
			id: 'plain',
			name: 'plain',
			type: 'plain',
			host: 'plain',
			port: 'plain',
			credential_id: 'plain',
			username: 'plain',
			domain: 'plain',
			notes: 'plain',
			created_at: 'plain',
			updated_at: 'plain',
		},
	},
	{
		table: 'tags',
		version: 1,
		keys: ['id'],
		fields: { id: 'plain', name: 'plain', normalized: 'plain' },
	},
	{
		table: 'connection_tags',
		version: 1,
		keys: ['connection_id', 'tag_id'],
		fields: { connection_id: 'plain', tag_id: 'plain' },
	},
] satisfies BackupDeclaration;

const fields = [
	'id',
	'name',
	'type',
	'host',
	'port',
	'credential_id as credentialId',
	'username',
	'domain',
	'notes',
	'created_at as createdAt',
	'updated_at as updatedAt',
] as const;

export class ConnectionsStorage {
	readonly #database: PluginDatabaseApi;

	constructor(database: PluginDatabaseApi) {
		this.#database = database;
	}

	list(): Promise<ConnectionCatalog> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute(async (transaction) => {
					const rows = await transaction
						.selectFrom('connections')
						.select(fields)
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
						connections: rows.map((row) => ({ ...row, tags: (grouped.get(row.id) ?? []).sort() })),
						tags: tags.map((tag) => ({ ...tag, count: counts.get(tag.id) ?? 0 })),
					};
				}),
		);
	}

	get(id: string): Promise<Connection | undefined> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute((transaction) => this.#read(transaction, id)),
		);
	}

	remove(id: string, signal: AbortSignal): Promise<boolean> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute(async (transaction) => {
					signal.throwIfAborted();
					const connection = await transaction
						.selectFrom('connections')
						.select('id')
						.where('id', '=', id)
						.executeTakeFirst();
					if (!connection) return false;
					signal.throwIfAborted();

					await transaction.deleteFrom('connection_tags').where('connection_id', '=', id).execute();
					await transaction.deleteFrom('connections').where('id', '=', id).execute();
					return true;
				}),
		);
	}

	removeTag(id: string, signal: AbortSignal): Promise<boolean> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute(async (transaction) => {
					signal.throwIfAborted();
					const tag = await transaction
						.selectFrom('tags')
						.select('id')
						.where('id', '=', id)
						.executeTakeFirst();
					if (!tag) return false;

					const links = await transaction
						.selectFrom('connection_tags')
						.select('connection_id')
						.where('tag_id', '=', id)
						.execute();
					signal.throwIfAborted();
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
					await transaction.deleteFrom('tags').where('id', '=', id).execute();
					return true;
				}),
		);
	}

	save(
		id: string,
		{ tags, credentialId, ...values }: ConnectionInput,
		updating: boolean,
		signal: AbortSignal,
	): Promise<Connection | undefined> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<ConnectionTables>()
				.transaction()
				.execute(async (transaction) => {
					signal.throwIfAborted();
					const now = Date.now();
					const value = { ...values, credential_id: credentialId, updated_at: now };

					if (updating) {
						const updated = await transaction
							.updateTable('connections')
							.set(value)
							.where('id', '=', id)
							.executeTakeFirst();
						if (!updated.numUpdatedRows) return undefined;
					} else {
						await transaction
							.insertInto('connections')
							.values({ ...value, id, created_at: now })
							.execute();
					}

					await this.#saveTags(transaction, id, tags);
					signal.throwIfAborted();

					// A failed read after a write must roll back the entire transaction.
					const row = await transaction
						.selectFrom('connections')
						.select(fields)
						.where('id', '=', id)
						.executeTakeFirstOrThrow();
					return { ...row, tags: await this.#readTags(transaction, id) };
				}),
		);
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
		const row = await db.selectFrom('connections').select(fields).where('id', '=', id).executeTakeFirst();
		if (!row) return undefined;
		return { ...row, tags: await this.#readTags(db, id) };
	}

	async #readTags(db: Kysely<ConnectionTables>, id: string): Promise<string[]> {
		const tags = await db
			.selectFrom('connection_tags')
			.innerJoin('tags', 'tags.id', 'connection_tags.tag_id')
			.select('tags.name')
			.where('connection_tags.connection_id', '=', id)
			.orderBy('tags.name')
			.execute();
		return tags.map(({ name }) => name);
	}
}
