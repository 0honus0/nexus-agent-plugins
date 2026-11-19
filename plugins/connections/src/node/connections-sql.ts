import type { BackupDeclaration, PluginModuleApi } from 'nexus-terminal/node';
import type { ConnectionType } from '../shared/connection-types.js';

export interface ConnectionRow {
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

export type ConnectionTables = {
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
