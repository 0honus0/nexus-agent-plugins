import type { BackupDeclaration, PluginDatabaseApi, PluginModuleApi } from 'nexus-terminal/node';
import type { OidcConfig } from '../shared/oidc-http-types.js';

const table = 'oidc_config';

export const secretContext = 'oidc/client-secret';

interface OidcConfigRow {
	id: 'owner';
	issuer: string;
	client_id: string;
	subject: string;
	origin: string;
	auth_method: OidcConfig['authMethod'];
	client_secret: Uint8Array | null;
}

type OidcTables = { [table]: OidcConfigRow };

export interface StoredOidcConfig extends OidcConfig {
	encryptedSecret: Uint8Array | null;
}

const fields = [
	'issuer',
	'client_id as clientId',
	'subject',
	'origin',
	'auth_method as authMethod',
	'client_secret as encryptedSecret',
] as const;

export const migrations: NonNullable<PluginModuleApi['migrations']> = {
	async getMigrations() {
		return {
			'001_oidc_config': {
				async up(db) {
					await db.schema
						.createTable(table)
						.addColumn('id', 'text', (column) => column.primaryKey())
						.addColumn('issuer', 'text', (column) => column.notNull())
						.addColumn('client_id', 'text', (column) => column.notNull())
						.addColumn('subject', 'text', (column) => column.notNull())
						.addColumn('origin', 'text', (column) => column.notNull())
						.addColumn('auth_method', 'text', (column) => column.notNull())
						.addColumn('client_secret', 'blob')
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
			issuer: 'plain',
			client_id: 'plain',
			subject: 'plain',
			origin: 'plain',
			auth_method: 'plain',
			client_secret: { secret: secretContext },
		},
	},
] satisfies BackupDeclaration;

export class OidcStorage {
	constructor(private readonly database: PluginDatabaseApi) {}

	get(): Promise<StoredOidcConfig | undefined> {
		return this.database.withClient((db) =>
			db
				.$extendTables<OidcTables>()
				.selectFrom(table)
				.select(fields)
				.where('id', '=', 'owner')
				.executeTakeFirst(),
		);
	}

	async save(
		{ issuer, clientId, subject, origin, authMethod, encryptedSecret }: StoredOidcConfig,
		signal: AbortSignal,
	) {
		const values = {
			issuer,
			client_id: clientId,
			subject,
			origin,
			auth_method: authMethod,
			client_secret: encryptedSecret,
		};
		await this.database.withClient(async (db) => {
			signal.throwIfAborted();
			await db
				.$extendTables<OidcTables>()
				.insertInto(table)
				.values({ id: 'owner', ...values })
				.onConflict((conflict) => conflict.column('id').doUpdateSet(values))
				.execute();
		});
	}

	async remove(signal: AbortSignal) {
		await this.database.withClient(async (db) => {
			signal.throwIfAborted();
			await db.$extendTables<OidcTables>().deleteFrom(table).where('id', '=', 'owner').execute();
		});
	}
}
