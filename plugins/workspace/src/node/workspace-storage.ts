import type { PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';
import { workspacePathHistoryLimit } from '../shared/workspace-path-history-types';

const resources = ['favorites', 'commands', 'themes', 'preferences'];
const backgrounds = ['background_settings', 'background_presets', 'background_images'];
const layouts = 'layouts';
const pathHistory = 'path_history';

export const migrations: NonNullable<PluginModuleApi['migrations']> = {
	async getMigrations() {
		return {
			'005_path_history': {
				async up(db) {
					await db.schema
						.createTable(pathHistory)
						.addColumn('path', 'text', (column) => column.primaryKey().notNull())
						.addColumn('visited_at', 'integer', (column) => column.notNull())
						.execute();
				},
			},
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
	{ table: pathHistory, version: 1, keys: ['path'], fields: { path: 'plain', visited_at: 'plain' } },
];

type Tables = {
	host_keys: { host: string; port: number; fingerprint: string };
	[pathHistory]: { path: string; visited_at: number };
};

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

	async listPaths(): Promise<string[]> {
		const rows = await this.database.withClient((client) =>
			client
				.$extendTables<Tables>()
				.selectFrom(pathHistory)
				.select('path')
				.orderBy('visited_at', 'desc')
				.orderBy('path')
				.limit(workspacePathHistoryLimit)
				.execute(),
		);
		return rows.map(({ path }) => path);
	}

	async recordPath(path: string): Promise<void> {
		await this.database.withClient((client) =>
			client
				.$extendTables<Tables>()
				.transaction()
				.execute(async (trx) => {
					const latest = await trx
						.selectFrom(pathHistory)
						.select('visited_at')
						.orderBy('visited_at', 'desc')
						.executeTakeFirst();
					const visitedAt = Math.max(Date.now(), (latest?.visited_at ?? 0) + 1);
					await trx
						.insertInto(pathHistory)
						.values({ path, visited_at: visitedAt })
						.onConflict((conflict) => conflict.column('path').doUpdateSet({ visited_at: visitedAt }))
						.execute();
					await trx
						.deleteFrom(pathHistory)
						.where(
							'path',
							'not in',
							trx
								.selectFrom(pathHistory)
								.select('path')
								.orderBy('visited_at', 'desc')
								.orderBy('path')
								.limit(workspacePathHistoryLimit),
						)
						.execute();
				}),
		);
	}

	async removePath(path: string): Promise<void> {
		await this.database.withClient((client) =>
			client.$extendTables<Tables>().deleteFrom(pathHistory).where('path', '=', path).execute(),
		);
	}
}
