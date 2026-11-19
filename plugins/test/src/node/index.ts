import {
	LogLevelSchema,
	LogParamsSchema,
	PluginLogInputSchema,
	type BackupDeclaration,
	type PluginModuleApi,
} from 'nexus-terminal/node';
import { RevisionSchema, type Revision } from '../sdk-fixture-types.js';
import { registerSdkRoutes } from './sdk-routes.js';
import {
	ListItemsInputSchema,
	ListItemsOutputSchema,
	type ListItemsInput,
	type ListItemsOutput,
} from '../items-http-types.js';

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

export const activate: PluginModuleApi['activate'] = async (context) => {
	const { app, onDispose, self } = context;
	if (self.readiness.value.state !== 'pending') throw new Error('SDK_TEST_READINESS');
	const forget = onDispose(() => {
		throw new Error('SDK_TEST_CLEANUP_NOT_UNREGISTERED');
	});
	forget();
	const heartbeat = setInterval(() => {
		app.log.report({ level: 'debug', code: 'TEST_PLUGIN_HEARTBEAT' });
	}, 1_000);
	onDispose(() => clearInterval(heartbeat));

	const input = new Uint8Array([0, 42, 255]);
	const options = { mode: 'local' } as const;
	const item = await app.database.withClient(async (client) => {
		const db = client.$extendTables<TestTables>();
		const existing = await db
			.selectFrom(table)
			.select(['payload', 'revision'])
			.where('id', '=', 'sample')
			.executeTakeFirst();
		if (existing) return existing;

		const encrypted = await app.crypto.encrypt(input, options);
		if (encrypted.isErr()) throw new Error(encrypted.error.code);
		return db
			.insertInto(table)
			.values({ id: 'sample', payload: encrypted.value, revision: 2 })
			.returning(['payload', 'revision'])
			.executeTakeFirstOrThrow();
	});

	const decrypted = await app.crypto.decrypt(item.payload, options);
	if (decrypted.isErr()) throw new Error(decrypted.error.code);
	if (decrypted.value.length !== input.length || !decrypted.value.every((byte, index) => byte === input[index])) {
		throw new Error('TEST_PLUGIN_CRYPTO_MISMATCH');
	}

	const state = app.state.register({
		name: 'revision',
		schema: RevisionSchema,
		initial: { revision: item.revision },
	});
	app.log.report(
		PluginLogInputSchema.parse({
			level: LogLevelSchema.parse('info'),
			code: 'TEST_PLUGIN_READY',
			params: LogParamsSchema.parse({ bytes: input.length, revision: item.revision }),
		}),
	);
	const forged = { level: 'info', code: 'SDK_FORGED_LOG', source: 'forged' } as const;
	app.log.report(forged);
	registerSdkRoutes(context);

	async function listItems({ limit }: ListItemsInput, signal: AbortSignal): Promise<ListItemsOutput> {
		const items = await app.database.withClient((client) =>
			client
				.$extendTables<TestTables>()
				.selectFrom(table)
				.select(['id', 'revision'])
				.orderBy('id')
				.limit(limit)
				.execute(),
		);
		signal.throwIfAborted();
		return { items };
	}

	app.http.register([
		{
			method: 'get',
			path: '/items',
			input: ListItemsInputSchema,
			output: ListItemsOutputSchema,
			handler: listItems,
		},
		{
			method: 'patch',
			path: '/revision',
			input: RevisionSchema,
			output: RevisionSchema,

			async handler({ revision }: Revision, signal) {
				await app.database.withClient((client) =>
					client
						.$extendTables<TestTables>()
						.updateTable(table)
						.set({ revision })
						.where('id', '=', 'sample')
						.execute(),
				);
				signal.throwIfAborted();
				state.publish({ revision });
				return { revision };
			},
		},
	] as const);
	self.readiness.set({ state: 'ready' });
};

export const deactivate: PluginModuleApi['deactivate'] = (context) => {
	if (!context.signal.aborted) throw new Error('SDK_TEST_NOT_CANCELLED');
};
