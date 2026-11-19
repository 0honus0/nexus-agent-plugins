import type { BackupDeclaration, PluginModuleApi } from 'nexus-terminal/node';

export const table = 'credentials';

export const references = 'credential_references';

export const materialContext = 'credentials/material';

export interface CredentialRow {
	id: string;
	name: string;
	username: string;
	type: 'password' | 'privateKey';
	material: Uint8Array;
	has_passphrase: number;
	created_at: number;
	updated_at: number;
}

export type CredentialTables = {
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
