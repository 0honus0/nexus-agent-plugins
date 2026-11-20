import type { BackupDeclaration, PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';
import type { Passkey } from '../shared/passkey-http-types.js';

const table = 'passkeys';

interface PasskeyRow {
	id: string;
	name: string;
	origin: string;
	public_key: Uint8Array;
	user_handle: string;
	counter: number;
	created_at: number;
}

type PasskeyTables = { [table]: PasskeyRow };

const metadata = ['id', 'name', 'origin', 'created_at as createdAt'] as const;

export const migrations: NonNullable<PluginModuleApi['migrations']> = {
	async getMigrations() {
		return {
			'001_passkeys': {
				async up(db) {
					await db.schema
						.createTable(table)
						.addColumn('id', 'text', (column) => column.primaryKey())
						.addColumn('name', 'text', (column) => column.notNull())
						.addColumn('origin', 'text', (column) => column.notNull())
						.addColumn('public_key', 'blob', (column) => column.notNull())
						.addColumn('user_handle', 'text', (column) => column.notNull())
						.addColumn('counter', 'integer', (column) => column.notNull())
						.addColumn('created_at', 'integer', (column) => column.notNull())
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
			origin: 'plain',
			public_key: 'plain',
			user_handle: 'plain',
			counter: 'plain',
			created_at: 'plain',
		},
	},
] satisfies BackupDeclaration;

export class PasskeyStorage {
	constructor(private readonly database: PluginDatabaseApi) {}

	list(): Promise<Passkey[]> {
		return this.database.withClient((db) =>
			db.$extendTables<PasskeyTables>().selectFrom(table).select(metadata).orderBy('created_at').execute(),
		);
	}

	async has(origin?: string): Promise<boolean> {
		return this.database.withClient(async (db) => {
			const query = db.$extendTables<PasskeyTables>().selectFrom(table).select('id');
			return Boolean(await (origin ? query.where('origin', '=', origin) : query).executeTakeFirst());
		});
	}

	registrationCredentials(origin: string) {
		return this.database.withClient((db) =>
			db
				.$extendTables<PasskeyTables>()
				.selectFrom(table)
				.select(['id', 'user_handle'])
				.where('origin', '=', origin)
				.orderBy('created_at')
				.execute(),
		);
	}

	credential(id: string, origin: string) {
		return this.database.withClient((db) =>
			db
				.$extendTables<PasskeyTables>()
				.selectFrom(table)
				.selectAll()
				.where('id', '=', id)
				.where('origin', '=', origin)
				.executeTakeFirst(),
		);
	}

	create(row: PasskeyRow, signal: AbortSignal): Promise<Passkey | undefined> {
		return this.database.withClient((db) => {
			signal.throwIfAborted();
			return db
				.$extendTables<PasskeyTables>()
				.insertInto(table)
				.values(row)
				.onConflict((conflict) => conflict.column('id').doNothing())
				.returning(metadata)
				.executeTakeFirst();
		});
	}

	async advanceCounter(id: string, previous: number, counter: number, signal: AbortSignal): Promise<boolean> {
		return this.database.withClient(async (db) => {
			signal.throwIfAborted();
			const { numUpdatedRows } = await db
				.$extendTables<PasskeyTables>()
				.updateTable(table)
				.set({ counter })
				.where('id', '=', id)
				.where('counter', '=', previous)
				.executeTakeFirst();
			return numUpdatedRows > 0n;
		});
	}

	async remove(id: string, signal: AbortSignal): Promise<boolean> {
		return this.database.withClient(async (db) => {
			signal.throwIfAborted();
			const { numDeletedRows } = await db
				.$extendTables<PasskeyTables>()
				.deleteFrom(table)
				.where('id', '=', id)
				.executeTakeFirst();
			return numDeletedRows > 0n;
		});
	}
}
