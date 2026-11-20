import type { PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';

const resources = ['favorites', 'commands', 'themes', 'preferences'];
const backgrounds = ['background_settings', 'background_presets', 'background_images'];
const layouts = 'layouts';

export const migrations: NonNullable<PluginModuleApi['migrations']> = {
	async getMigrations() {
		return {
			'004_backgrounds': {
				async up(db) {
					for (const resource of backgrounds)
						await db.schema
							.createTable(resource)
							.addColumn('id', 'text', (c) => c.primaryKey())
							.addColumn('version', 'integer', (c) => c.notNull())
							.addColumn('document', 'text', (c) => c.notNull())
							.execute();
				},
			},
			'003_tools': {
				async up(db) {
					for (const resource of resources)
						await db.schema
							.createTable(resource)
							.addColumn('id', 'text', (c) => c.primaryKey())
							.addColumn('version', 'integer', (c) => c.notNull())
							.addColumn('document', 'text', (c) => c.notNull())
							.execute();
				},
			},
			'002_layouts': {
				async up(db) {
					await db.schema
						.createTable(layouts)
						.addColumn('profile', 'text', (c) => c.primaryKey())
						.addColumn('document', 'text', (c) => c.notNull())
						.execute();
				},
			},
			'001_host_keys': {
				async up(db) {
					await db.schema
						.createTable('host_keys')
						.addColumn('host', 'text', (c) => c.notNull())
						.addColumn('port', 'integer', (c) => c.notNull())
						.addColumn('fingerprint', 'text', (c) => c.notNull())
						.addPrimaryKeyConstraint('host_keys_pk', ['host', 'port'])
						.execute();
				},
			},
		};
	},
};

// Host trust belongs to this installation.
export const backup: NonNullable<PluginModuleApi['backup']> = [
	...[...resources, ...backgrounds].map((table) => ({
		table,
		version: 1,
		keys: ['id'],
		fields: { id: 'plain' as const, version: 'plain' as const, document: 'plain' as const },
	})),
	{ table: layouts, version: 1, keys: ['profile'], fields: { profile: 'plain', document: 'plain' } },
];

type Tables = { host_keys: { host: string; port: number; fingerprint: string } };

export class WorkspaceStorage {
	constructor(private readonly database: PluginDatabaseApi) {}

	getHostKey(host: string, port: number) {
		return this.database.withClient((client) =>
			client
				.$extendTables<Tables>()
				.selectFrom('host_keys')
				.select('fingerprint')
				.where('host', '=', host)
				.where('port', '=', port)
				.executeTakeFirst(),
		);
	}

	async saveHostKey(host: string, port: number, fingerprint: string) {
		await this.database.withClient((client) =>
			client
				.$extendTables<Tables>()
				.insertInto('host_keys')
				.values({ host, port, fingerprint })
				.onConflict((conflict) => conflict.columns(['host', 'port']).doUpdateSet({ fingerprint }))
				.execute(),
		);
	}
}
