import { createPrivateKey, randomUUID } from 'node:crypto';
import type { SshApi } from '@nexus-terminal/ssh/ssh-api';
import type { PluginAppApi } from 'nexus-terminal/node';
import {
	CredentialInputSchema,
	CredentialPatchSchema,
	type Credential,
	type CredentialInput,
	type CredentialMaterial,
	type CredentialPatch,
	type CredentialsSnapshot,
} from '../shared/credentials-types.js';
import { materialContext, references, table, type CredentialRow, type CredentialTables } from './credentials-sql.js';

export type CredentialErrorCode =
	| 'CREDENTIALS_INVALID_REQUEST'
	| 'CREDENTIALS_NOT_FOUND'
	| 'CREDENTIALS_IN_USE'
	| 'CREDENTIALS_KEY_INVALID'
	| 'CREDENTIALS_PRIVATE_KEY_REQUIRED'
	| 'CREDENTIALS_KEY_TYPE_UNSUPPORTED'
	| 'CREDENTIALS_OPERATION_FAILED';

export class CredentialError extends Error {
	override readonly name = 'CredentialError';

	constructor(
		readonly code: CredentialErrorCode,
		options?: ErrorOptions,
	) {
		super(code, options);
	}
}

export type {
	Credential,
	CredentialInput,
	CredentialPatch,
	CredentialMaterial,
	CredentialsSnapshot,
} from '../shared/credentials-types.js';

export interface CredentialsApi {
	list(): Promise<CredentialsSnapshot>;
	get(id: string): Promise<Credential | undefined>;
	create(input: CredentialInput, signal?: AbortSignal): Promise<Credential>;
	update(id: string, patch: CredentialPatch, signal?: AbortSignal): Promise<Credential>;
	remove(id: string, signal?: AbortSignal): Promise<void>;

	/** 只供声明依赖的后端插件在使用时解密。 */
	resolve(id: string): Promise<CredentialMaterial>;

	/** 串行保护引用；回调在其所属插件中完成写入。 */
	withReference<T>(
		owner: string,
		key: string,
		credentialId: string | null,
		save: () => Promise<T>,
		signal?: AbortSignal,
	): Promise<T>;
}

declare module 'nexus-terminal/node' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/credentials': { readonly credentials: CredentialsApi };
	}
}

const metadata = ['id', 'name', 'username', 'type', 'has_passphrase', 'created_at', 'updated_at'] as const;
const cryptoOptions = { mode: 'local', context: materialContext } as const;

function summary(row: Pick<CredentialRow, (typeof metadata)[number]>): Credential {
	const { id, name, username, type, has_passphrase, created_at, updated_at } = row;
	return {
		id,
		name,
		username,
		type,
		hasPassphrase: Boolean(has_passphrase),
		createdAt: created_at,
		updatedAt: updated_at,
	};
}

export class Credentials implements CredentialsApi {
	#revision = 0;
	#pending: Promise<unknown> = Promise.resolve();

	readonly #app: Pick<PluginAppApi, 'database' | 'crypto'>;
	readonly #ssh: Pick<SshApi, 'parsePrivateKey'>;
	readonly #signal: AbortSignal;
	readonly #publish: (revision: number) => void;

	constructor(
		app: Pick<PluginAppApi, 'database' | 'crypto'>,
		ssh: Pick<SshApi, 'parsePrivateKey'>,
		signal: AbortSignal,
		publish: (revision: number) => void,
	) {
		this.#app = app;
		this.#ssh = ssh;
		this.#signal = signal;
		this.#publish = publish;
	}

	async list(): Promise<CredentialsSnapshot> {
		this.#signal.throwIfAborted();
		const rows = await this.#app.database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.selectFrom(table)
				.select(metadata)
				.orderBy('name')
				.orderBy('id')
				.execute(),
		);
		this.#signal.throwIfAborted();
		return { revision: this.#revision, items: rows.map(summary) };
	}

	async get(id: string): Promise<Credential | undefined> {
		this.#signal.throwIfAborted();
		const row = await this.#app.database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.selectFrom(table)
				.select(metadata)
				.where('id', '=', id)
				.executeTakeFirst(),
		);
		this.#signal.throwIfAborted();
		return row && summary(row);
	}

	async resolve(id: string): Promise<CredentialMaterial> {
		const input = await this.#material(id);
		this.#signal.throwIfAborted();
		return this.#keyMaterial(input);
	}

	create(input: CredentialInput, signal?: AbortSignal): Promise<Credential> {
		return this.#write(signal, async () => {
			const parsed = CredentialInputSchema.safeParse(input);
			if (!parsed.success) throw new CredentialError('CREDENTIALS_INVALID_REQUEST');
			const value = await this.#encode(parsed.data);
			const now = Date.now();
			this.#assertActive(signal);
			const row = { ...value, id: randomUUID(), created_at: now, updated_at: now };
			await this.#app.database.withClient((db) =>
				db.$extendTables<CredentialTables>().insertInto(table).values(row).execute(),
			);
			this.#changed();
			return summary(row);
		});
	}

	update(id: string, patch: CredentialPatch, signal?: AbortSignal): Promise<Credential> {
		return this.#write(signal, async () => {
			const changes = CredentialPatchSchema.safeParse(patch);
			if (!changes.success) throw new CredentialError('CREDENTIALS_INVALID_REQUEST');
			const old = await this.#material(id);
			const previous =
				changes.data.type && changes.data.type !== old.type ? { name: old.name, username: old.username } : old;
			const parsed = CredentialInputSchema.safeParse({ ...previous, ...changes.data });
			if (!parsed.success) throw new CredentialError('CREDENTIALS_INVALID_REQUEST');
			const value = await this.#encode(parsed.data);
			this.#assertActive(signal);
			const updated = await this.#app.database.withClient((db) =>
				db
					.$extendTables<CredentialTables>()
					.updateTable(table)
					.set({ ...value, updated_at: Date.now() })
					.where('id', '=', id)
					.returning(metadata)
					.executeTakeFirstOrThrow(),
			);
			this.#changed();
			return summary(updated);
		});
	}

	remove(id: string, signal?: AbortSignal): Promise<void> {
		return this.#write(signal, async () => {
			await this.#app.database.withClient((db) =>
				db
					.$extendTables<CredentialTables>()
					.transaction()
					.execute(async (transaction) => {
						const link = await transaction
							.selectFrom(references)
							.select('key')
							.where('credential_id', '=', id)
							.executeTakeFirst();
						if (link) throw new CredentialError('CREDENTIALS_IN_USE');
						this.#assertActive(signal);
						const deleted = await transaction.deleteFrom(table).where('id', '=', id).executeTakeFirst();
						if (!deleted.numDeletedRows) throw new CredentialError('CREDENTIALS_NOT_FOUND');
					}),
			);
			this.#changed();
		});
	}

	withReference<T>(
		owner: string,
		key: string,
		id: string | null,
		save: () => Promise<T>,
		signal?: AbortSignal,
	): Promise<T> {
		return this.#write(signal, async () => {
			let inserted = false;
			if (id) {
				if (!(await this.get(id))) throw new CredentialError('CREDENTIALS_NOT_FOUND');
				inserted = await this.#app.database.withClient(async (db) => {
					const result = await db
						.$extendTables<CredentialTables>()
						.insertInto(references)
						.values({ owner, key, credential_id: id })
						.onConflict((conflict) => conflict.columns(['owner', 'key', 'credential_id']).doNothing())
						.returning('key')
						.executeTakeFirst();
					return result !== undefined;
				});
			}

			// 提交前保留旧和新引用。跨插件写入中断时，缓存的引用最多过于保守。
			let result: T;
			try {
				this.#signal.throwIfAborted();
				result = await save();
			} catch (cause) {
				if (id && inserted && !this.#signal.aborted && !signal?.aborted)
					await this.#app.database.withClient((db) =>
						db
							.$extendTables<CredentialTables>()
							.deleteFrom(references)
							.where('owner', '=', owner)
							.where('key', '=', key)
							.where('credential_id', '=', id)
							.execute(),
					);
				throw cause;
			}

			await this.#app.database.withClient((db) => {
				const stale = db
					.$extendTables<CredentialTables>()
					.deleteFrom(references)
					.where('owner', '=', owner)
					.where('key', '=', key);
				return (id ? stale.where('credential_id', '!=', id) : stale).execute();
			});
			return result;
		});
	}

	#assertActive(signal?: AbortSignal): void {
		this.#signal.throwIfAborted();
		signal?.throwIfAborted();
	}

	#write<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
		const result = this.#pending.then(() => {
			this.#assertActive(signal);
			return operation();
		});
		this.#pending = result.catch(() => undefined);
		return result;
	}

	#changed(): void {
		const revision = ++this.#revision;
		if (!this.#signal.aborted) this.#publish(revision);
	}

	async #material(id: string): Promise<CredentialInput> {
		this.#signal.throwIfAborted();
		const row = await this.#app.database.withClient((db) =>
			db
				.$extendTables<CredentialTables>()
				.selectFrom(table)
				.select(['material', 'name', 'username'])
				.where('id', '=', id)
				.executeTakeFirst(),
		);
		this.#signal.throwIfAborted();
		if (!row) throw new CredentialError('CREDENTIALS_NOT_FOUND');
		const clear = await this.#app.crypto.decrypt(row.material, cryptoOptions);
		if (clear.isErr()) throw new CredentialError('CREDENTIALS_OPERATION_FAILED', { cause: clear.error });
		try {
			this.#signal.throwIfAborted();
			return CredentialInputSchema.parse({
				...JSON.parse(new TextDecoder().decode(clear.value)),
				name: row.name,
				username: row.username,
			});
		} finally {
			clear.value.fill(0);
		}
	}

	#keyMaterial(input: CredentialInput): CredentialInput {
		if (input.type !== 'privateKey') return input;
		try {
			let { privateKey, passphrase } = input;
			if (/-----BEGIN (ENCRYPTED )?PRIVATE KEY-----/u.test(privateKey)) {
				const key = createPrivateKey({ key: privateKey, format: 'pem', passphrase: passphrase ?? undefined });
				if (key.asymmetricKeyType !== 'rsa' && key.asymmetricKeyType !== 'ec')
					throw new CredentialError('CREDENTIALS_KEY_TYPE_UNSUPPORTED');
				privateKey = key
					.export({ format: 'pem', type: key.asymmetricKeyType === 'rsa' ? 'pkcs1' : 'sec1' })
					.toString();
				passphrase = null;
			}
			this.#ssh.parsePrivateKey(privateKey, passphrase ?? undefined);
			return { ...input, privateKey, passphrase };
		} catch (cause) {
			if (cause instanceof CredentialError) throw cause;
			const code =
				cause instanceof Error && 'code' in cause && cause.code === 'SSH_PRIVATE_KEY_REQUIRED'
					? 'CREDENTIALS_PRIVATE_KEY_REQUIRED'
					: 'CREDENTIALS_KEY_INVALID';
			throw new CredentialError(code, { cause });
		}
	}

	async #encode(input: CredentialInput) {
		this.#keyMaterial(input);
		const clear = new TextEncoder().encode(JSON.stringify(input));
		try {
			const result = await this.#app.crypto.encrypt(clear, cryptoOptions);
			if (result.isErr()) throw new CredentialError('CREDENTIALS_OPERATION_FAILED', { cause: result.error });
			return {
				name: input.name,
				username: input.username,
				type: input.type,
				material: result.value,
				has_passphrase: Number(input.type === 'privateKey' && Boolean(input.passphrase)),
			};
		} finally {
			clear.fill(0);
		}
	}
}
