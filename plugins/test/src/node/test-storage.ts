import type { BackupDeclaration, PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';

const table = 'items';

type TestTables = Record<typeof table, { id: string; payload: Uint8Array; revision: number }>;

export const migrations = {
	async getMigrations() {
		return {
			'001_items': {
				async up(db) {
					await db.schema
						.createTable(table)
						.addColumn('id', 'text', (column) => column.primaryKey())
						.addColumn('payload', 'blob', (column) => column.notNull())
						.execute();
				},
			},
			'002_item_revision': {
				async up(db) {
					await db.schema
						.alterTable(table)
						.addColumn('revision', 'integer', (column) => column.notNull().defaultTo(1))
						.execute();
				},
			},
		};
	},
} satisfies NonNullable<PluginModuleApi['migrations']>;

export const backup = [
	{
		table,
		version: 2,
		keys: ['id'],
		fields: { id: 'plain', payload: 'secret', revision: 'plain' },
	},
] satisfies BackupDeclaration;

const sampleId = 'sample';

export class TestStorage {
	readonly #database: PluginDatabaseApi;

	constructor(database: PluginDatabaseApi) {
		this.#database = database;
	}

	getSample(): Promise<Pick<TestTables['items'], 'payload' | 'revision'> | undefined> {
		return this.#database.withClient((client) =>
			client
				.$extendTables<TestTables>()
				.selectFrom(table)
				.select(['payload', 'revision'])
				.where('id', '=', sampleId)
				.executeTakeFirst(),
		);
	}

	insertSample(payload: Uint8Array): Promise<Pick<TestTables['items'], 'payload' | 'revision'>> {
		return this.#database.withClient((client) =>
			client
				.$extendTables<TestTables>()
				.insertInto(table)
				.values({ id: sampleId, payload, revision: 2 })
				.returning(['payload', 'revision'])
				.executeTakeFirstOrThrow(),
		);
	}

	listItems(limit: number): Promise<Pick<TestTables['items'], 'id' | 'revision'>[]> {
		return this.#database.withClient((client) =>
			client
				.$extendTables<TestTables>()
				.selectFrom(table)
				.select(['id', 'revision'])
				.orderBy('id')
				.limit(limit)
				.execute(),
		);
	}

	async updateSampleRevision(revision: number): Promise<void> {
		await this.#database.withClient((client) =>
			client
				.$extendTables<TestTables>()
				.updateTable(table)
				.set({ revision })
				.where('id', '=', sampleId)
				.execute(),
		);
	}
}
