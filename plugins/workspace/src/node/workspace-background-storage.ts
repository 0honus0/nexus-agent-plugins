import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import type { PluginDatabaseApi } from 'nexus-terminal/node';
import {
	BackgroundSettingsSchema,
	defaultBackgroundSettings,
	BackgroundPresetInputSchema,
	BackgroundSnapshotSchema,
	BackgroundImageSchema,
	backgroundImageLimit,
	type BackgroundSettings,
} from '../shared/workspace-background-types';
import { terminalBackgroundPresets } from '../shared/terminal-background-presets';
import { WorkspaceError } from './workspace-error';

import type { Kysely } from 'kysely';

type Row = { id: string; version: number; document: string };

const settingsTable = 'background_settings',
	presetsTable = 'background_presets',
	imagesTable = 'background_images';
type Transaction = Kysely<Record<string, Row>>;

const readSettings = async (client: Transaction) => {
	const row = await client.selectFrom(settingsTable).selectAll().where('id', '=', 'main').executeTakeFirst();
	return {
		settings: BackgroundSettingsSchema.parse(row ? JSON.parse(row.document) : defaultBackgroundSettings),
		version: row?.version ?? 0,
	};
};

const writeSettings = async (trx: Transaction, value: BackgroundSettings, version: number) => {
	const row = { id: 'main', version: version + 1, document: JSON.stringify(value) };
	await trx
		.insertInto(settingsTable)
		.values(row)
		.onConflict((oc) => oc.column('id').doUpdateSet(row))
		.execute();
};

const check = (actual: number, expected: number) => {
	if (actual !== expected) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
};

export class WorkspaceBackgroundStorage {
	constructor(private readonly database: PluginDatabaseApi) {}

	snapshot() {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			return db.transaction().execute(async (trx) => {
				const state = await readSettings(trx);
				const presets = await trx.selectFrom(presetsTable).selectAll().orderBy('id').execute();
				const image = await trx.selectFrom(imagesTable).selectAll().executeTakeFirst();
				return BackgroundSnapshotSchema.parse({
					...state,
					image: image ? { id: image.id, ...JSON.parse(image.document) } : null,
					presets: presets.map((row) => ({
						id: row.id,
						version: row.version,
						...JSON.parse(row.document),
					})),
				});
			});
		});
	}

	settings(version: number, patch: unknown) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			const changes = BackgroundSettingsSchema.partial().parse(patch);
			await db.transaction().execute(async (trx) => {
				const previous = await readSettings(trx);
				check(previous.version, version);
				const next = BackgroundSettingsSchema.parse({ ...previous.settings, ...changes });
				if (next.preset && !terminalBackgroundPresets.some((item) => item.id === next.preset)) {
					const preset = await trx
						.selectFrom(presetsTable)
						.select('id')
						.where('id', '=', next.preset)
						.executeTakeFirst();
					if (!preset) throw new WorkspaceError('WORKSPACE_BACKGROUND_NOT_FOUND', 404);
				}
				await writeSettings(trx, next, version);
			});
			return this.snapshot();
		});
	}

	savePreset(id: string | undefined, version: number, input: unknown) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			const value = BackgroundPresetInputSchema.parse(input);
			await db.transaction().execute(async (trx) => {
				if (id) {
					const row = await trx.selectFrom(presetsTable).selectAll().where('id', '=', id).executeTakeFirst();
					if (!row) throw new WorkspaceError('WORKSPACE_BACKGROUND_NOT_FOUND', 404);
					check(row.version, version);
					await trx
						.updateTable(presetsTable)
						.set({ version: version + 1, document: JSON.stringify(value) })
						.where('id', '=', id)
						.execute();
				} else {
					check(0, version);
					const count = await trx
						.selectFrom(presetsTable)
						.select(({ fn }) => fn.countAll<number>().as('count'))
						.executeTakeFirstOrThrow();
					if (Number(count.count) >= 50) throw new WorkspaceError('WORKSPACE_BACKGROUND_LIMIT', 409);
					await trx
						.insertInto(presetsTable)
						.values({ id: randomUUID(), version: 1, document: JSON.stringify(value) })
						.execute();
				}
			});
			return this.snapshot();
		});
	}

	removePreset(id: string, version: number) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			await db.transaction().execute(async (trx) => {
				const result = await trx
					.deleteFrom(presetsTable)
					.where('id', '=', id)
					.where('version', '=', version)
					.executeTakeFirst();
				if (!result.numDeletedRows) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
				const previous = await readSettings(trx);
				if (previous.settings.preset === id)
					await writeSettings(trx, { ...previous.settings, preset: null }, previous.version);
			});
			return this.snapshot();
		});
	}

	upload(version: number, bytes: Buffer) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			if (!bytes.length || bytes.length > backgroundImageLimit)
				throw new WorkspaceError('WORKSPACE_BACKGROUND_IMAGE_INVALID', 400);
			const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
			const parsed = BackgroundImageSchema.safeParse({
				id: randomUUID(),
				mime: detected?.mime,
				bytes: bytes.length,
			});
			if (!parsed.success) throw new WorkspaceError('WORKSPACE_BACKGROUND_IMAGE_INVALID', 400);
			await db.transaction().execute(async (trx) => {
				const previous = await readSettings(trx);
				check(previous.version, version);
				await trx.deleteFrom(imagesTable).execute();
				await trx
					.insertInto(imagesTable)
					.values({
						id: parsed.data.id,
						version: 1,
						document: JSON.stringify({
							mime: parsed.data.mime,
							bytes: bytes.length,
							data: bytes.toString('base64'),
						}),
					})
					.execute();
				await writeSettings(trx, { ...previous.settings, enabled: true }, version);
			});
			return this.snapshot();
		});
	}

	removeImage(version: number) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			await db.transaction().execute(async (trx) => {
				const previous = await readSettings(trx);
				check(previous.version, version);
				await trx.deleteFrom(imagesTable).execute();
				await writeSettings(trx, previous.settings, version);
			});
			return this.snapshot();
		});
	}

	image(id: string) {
		return this.database.withClient(async (client) => {
			const db = client.$extendTables<Record<string, Row>>();
			const row = await db.selectFrom(imagesTable).selectAll().where('id', '=', id).executeTakeFirst();
			if (!row) throw new WorkspaceError('WORKSPACE_BACKGROUND_NOT_FOUND', 404);
			const document = JSON.parse(row.document);
			const info = BackgroundImageSchema.parse({ ...document, id });
			return { mime: info.mime, data: Buffer.from(document.data, 'base64') };
		});
	}
}
