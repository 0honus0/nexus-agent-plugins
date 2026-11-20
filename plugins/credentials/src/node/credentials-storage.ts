import { randomUUID } from 'node:crypto';
import type { BackupDeclaration, PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';
import type { Credential } from '../shared/credentials-types.js';

const table = 'credentials';

const references = 'credential_references';

export const materialContext = 'credentials/material';

interface CredentialRow {
	id: string;
	name: string;
	username: string;
	type: 'password' | 'privateKey';
	material: Uint8Array;
	has_passphrase: number;
	created_at: number;
	updated_at: number;
}

type CredentialTables = {
	[table]: CredentialRow;
	[references]: { owner: string; key: string; credential_id: string };
};

export const migrations: NonNullable<PluginModuleApi['migrations']> = {
	async getMigrations() {
		return {
			'001_credentials': {
				async up(db) {
					await db.schema
						.createTable(table)
						.addColumn('id', 'text', (column) => column.primaryKey())
						.addColumn('name', 'text', (column) => column.notNull())
						.addColumn('username', 'text', (column) => column.notNull())
						.addColumn('type', 'text', (column) => column.notNull())
						.addColumn('material', 'blob', (column) => column.notNull())
						.addColumn('has_passphrase', 'integer', (column) => column.notNull())
						.addColumn('created_at', 'integer', (column) => column.notNull())
						.addColumn('updated_at', 'integer', (column) => column.notNull())
						.execute();

					await db.schema
						.createTable(references)
						.addColumn('owner', 'text', (column) => column.notNull())
						.addColumn('key', 'text', (column) => column.notNull())
						.addColumn('credential_id', 'text', (column) => column.notNull())
						.addPrimaryKeyConstraint('credential_reference_pk', ['owner', 'key', 'credential_id'])
						.execute();

					await db.schema
						.createIndex('credential_reference_lookup')
						.on(references)
						.column('credential_id')
						.execute();
				},
			},
		};
	},
};

export const backup = [
	{
		table,
		version: 1,
		keys: ['id'],
		fields: {
			id: 'plain',
			name: 'plain',
			username: 'plain',
			type: 'plain',
			has_passphrase: 'plain',
			created_at: 'plain',
			updated_at: 'plain',
			material: { secret: materialContext },
		},
	},
	{
		table: references,
		version: 1,
		keys: ['owner', 'key', 'credential_id'],
		fields: { owner: 'plain', key: 'plain', credential_id: 'plain' },
	},
] satisfies BackupDeclaration;

const metadata = [
	'id',
	'name',
	'username',
	'type',
	'has_passphrase as hasPassphrase',
	'created_at as createdAt',
	'updated_at as updatedAt',
] as const;

type CredentialProjection = Omit<Credential, 'hasPassphrase'> & { hasPassphrase: number };

export type StoredCredential = Pick<Credential, 'name' | 'username' | 'type' | 'hasPassphrase'> & {
	material: Uint8Array;
};

export class CredentialsStorage {
	readonly #database: PluginDatabaseApi;

	constructor(database: PluginDatabaseApi) {
		this.#database = database;
	}

	async list(): Promise<Credential[]> {
		const rows = await this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.selectFrom(table)
				.select(metadata)
				.orderBy('name')
				.orderBy('id')
				.execute(),
		);
		return rows.map((row) => this.#readMetadata(row));
	}

	async get(id: string): Promise<Credential | undefined> {
		const row = await this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.selectFrom(table)
				.select(metadata)
				.where('id', '=', id)
				.executeTakeFirst(),
		);
		return row && this.#readMetadata(row);
	}

	getMaterial(id: string): Promise<Pick<CredentialRow, 'material' | 'name' | 'username'> | undefined> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.selectFrom(table)
				.select(['material', 'name', 'username'])
				.where('id', '=', id)
				.executeTakeFirst(),
		);
	}

	async create({ hasPassphrase, ...value }: StoredCredential): Promise<Credential> {
		const now = Date.now();
		const row = await this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.insertInto(table)
				.values({
					...value,
					id: randomUUID(),
					has_passphrase: Number(hasPassphrase),
					created_at: now,
					updated_at: now,
				})
				.returning(metadata)
				.executeTakeFirstOrThrow(),
		);
		return this.#readMetadata(row);
	}

	async update(id: string, { hasPassphrase, ...value }: StoredCredential): Promise<Credential> {
		const row = await this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.updateTable(table)
				.set({ ...value, has_passphrase: Number(hasPassphrase), updated_at: Date.now() })
				.where('id', '=', id)
				.returning(metadata)
				.executeTakeFirstOrThrow(),
		);
		return this.#readMetadata(row);
	}

	remove(id: string, signal: AbortSignal): Promise<'removed' | 'missing' | 'in-use'> {
		return this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.transaction()
				.execute(async (transaction) => {
					const link = await transaction
						.selectFrom(references)
						.select('key')
						.where('credential_id', '=', id)
						.executeTakeFirst();
					if (link) return 'in-use';
					signal.throwIfAborted();
					const deleted = await transaction.deleteFrom(table).where('id', '=', id).executeTakeFirst();
					return deleted.numDeletedRows ? 'removed' : 'missing';
				}),
		);
	}

	addReference(owner: string, key: string, id: string): Promise<boolean> {
		return this.#database.withClient(async (db) => {
			const result = await db
				.$extendTables<CredentialTables>()
				.insertInto(references)
				.values({ owner, key, credential_id: id })
				.onConflict((conflict) => conflict.columns(['owner', 'key', 'credential_id']).doNothing())
				.returning('key')
				.executeTakeFirst();
			return result !== undefined;
		});
	}

	async removeReference(owner: string, key: string, id: string): Promise<void> {
		await this.#database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.deleteFrom(references)
				.where('owner', '=', owner)
				.where('key', '=', key)
				.where('credential_id', '=', id)
				.execute(),
		);
	}

	async pruneReferences(owner: string, key: string, id: string | null): Promise<void> {
		await this.#database.withClient((db) => {
			const stale = db
				.$extendTables<CredentialTables>()
				.deleteFrom(references)
				.where('owner', '=', owner)
				.where('key', '=', key);
			return (id ? stale.where('credential_id', '!=', id) : stale).execute();
		});
	}

	#readMetadata({ hasPassphrase, ...row }: CredentialProjection): Credential {
		return { ...row, hasPassphrase: Boolean(hasPassphrase) };
	}
}
