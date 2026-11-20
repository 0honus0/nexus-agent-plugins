import { randomUUID } from 'node:crypto';
import type { PluginDatabaseApi } from 'nexus-terminal/node';
import {
	FavoriteInputSchema,
	CommandInputSchema,
	ThemeInputSchema,
	WorkspacePreferencesSchema,
	WorkspaceCatalogSchema,
	type CatalogResource,
} from '../shared/workspace-catalog-types';
import { WorkspaceError } from './workspace-error';
const schemas = {
	favorites: FavoriteInputSchema,
	commands: CommandInputSchema,
	themes: ThemeInputSchema,
};

type Row = { id: string; version: number; document: string };

const decode = (row: { id: string; version: number; document: string }) => ({
	...JSON.parse(row.document),
	id: row.id,
	version: row.version,
});

export class WorkspaceCatalogStorage {
	constructor(private readonly database: PluginDatabaseApi) {}

	snapshot() {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			const [favorites, commands, themes, preferences] = await Promise.all([
				...(['favorites', 'commands', 'themes'] as const).map((kind) =>
					db
						.selectFrom(kind)
						.selectAll()
						.execute()
						.then((rows) => rows.map(decode)),
				),
				db.selectFrom('preferences').selectAll().where('id', '=', 'main').executeTakeFirst(),
			]);
			return WorkspaceCatalogSchema.parse({
				favorites,
				commands,
				themes,
				preferences:
					preferences && !Array.isArray(preferences)
						? { ...JSON.parse(preferences.document), version: preferences.version }
						: { theme: null, version: 0 },
			});
		});
	}

	save(kind: CatalogResource, id: string | undefined, version: number, input: unknown) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			const value = schemas[kind].parse(input);
			if (!id) {
				if (version !== 0) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
				const document = {
					...value,
					...(kind === 'commands' ? { usageCount: 0, lastUsedAt: null } : {}),
				};
				await db
					.insertInto(kind)
					.values({ id: randomUUID(), version: 1, document: JSON.stringify(document) })
					.execute();
			} else
				await db.transaction().execute(async (trx) => {
					const row = await trx.selectFrom(kind).selectAll().where('id', '=', id).executeTakeFirst();
					if (!row || row.version !== version) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
					const document = { ...JSON.parse(row.document), ...value };
					await trx
						.updateTable(kind)
						.set({ document: JSON.stringify(document), version: version + 1 })
						.where('id', '=', id)
						.execute();
				});
			return this.snapshot();
		});
	}

	remove(kind: CatalogResource, id: string, version: number) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			await db.transaction().execute(async (trx) => {
				const result = await trx
					.deleteFrom(kind)
					.where('id', '=', id)
					.where('version', '=', version)
					.executeTakeFirst();
				if (!result.numDeletedRows) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
				if (kind === 'themes') {
					const prefs = await trx
						.selectFrom('preferences')
						.selectAll()
						.where('id', '=', 'main')
						.executeTakeFirst();
					if (prefs && JSON.parse(prefs.document).theme === id)
						await trx
							.updateTable('preferences')
							.set({
								document: JSON.stringify({ ...JSON.parse(prefs.document), theme: null }),
								version: prefs.version + 1,
							})
							.where('id', '=', 'main')
							.execute();
				}
			});
			return this.snapshot();
		});
	}

	preferences(version: number, input: unknown) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			const value = WorkspacePreferencesSchema.parse(input);
			await db.transaction().execute(async (trx) => {
				const row = await trx.selectFrom('preferences').selectAll().where('id', '=', 'main').executeTakeFirst();
				if ((row?.version ?? 0) !== version) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
				await trx
					.insertInto('preferences')
					.values({ id: 'main', version: version + 1, document: JSON.stringify(value) })
					.onConflict((oc) =>
						oc.column('id').doUpdateSet({ version: version + 1, document: JSON.stringify(value) }),
					)
					.execute();
			});
			return this.snapshot();
		});
	}

	used(id: string) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			await db.transaction().execute(async (trx) => {
				const row = await trx.selectFrom('commands').selectAll().where('id', '=', id).executeTakeFirst();
				if (!row) return;
				const data = JSON.parse(row.document);
				await trx
					.updateTable('commands')
					.set({
						document: JSON.stringify({
							...data,
							usageCount: (data.usageCount ?? 0) + 1,
							lastUsedAt: Date.now(),
						}),
					})
					.where('id', '=', id)
					.execute();
			});
			return this.snapshot();
		});
	}
}
