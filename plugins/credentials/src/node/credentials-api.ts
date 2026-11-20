import { createPrivateKey } from 'node:crypto';
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
import { CredentialsStorage, materialContext, type StoredCredential } from './credentials-storage.js';

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

const cryptoOptions = { mode: 'local', context: materialContext } as const;

export class Credentials implements CredentialsApi {
	#revision = 0;
	#pending: Promise<unknown> = Promise.resolve();

	readonly #storage: CredentialsStorage;
	readonly #crypto: PluginAppApi['crypto'];
	readonly #ssh: Pick<SshApi, 'parsePrivateKey'>;
	readonly #signal: AbortSignal;
	readonly #publish: (revision: number) => void;

	constructor(
		app: Pick<PluginAppApi, 'database' | 'crypto'>,
		ssh: Pick<SshApi, 'parsePrivateKey'>,
		signal: AbortSignal,
		publish: (revision: number) => void,
	) {
		this.#storage = new CredentialsStorage(app.database);
		this.#crypto = app.crypto;
		this.#ssh = ssh;
		this.#signal = signal;
		this.#publish = publish;
	}

	async list(): Promise<CredentialsSnapshot> {
		this.#signal.throwIfAborted();
		const items = await this.#storage.list();
		this.#signal.throwIfAborted();
		return { revision: this.#revision, items };
	}

	async get(id: string): Promise<Credential | undefined> {
		this.#signal.throwIfAborted();
		const value = await this.#storage.get(id);
		this.#signal.throwIfAborted();
		return value;
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
			this.#assertActive(signal);
			const created = await this.#storage.create(value);
			this.#changed();
			return created;
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
			const updated = await this.#storage.update(id, value);
			this.#changed();
			return updated;
		});
	}

	remove(id: string, signal?: AbortSignal): Promise<void> {
		return this.#write(signal, async () => {
			const lifetime = signal ? AbortSignal.any([this.#signal, signal]) : this.#signal;
			const result = await this.#storage.remove(id, lifetime);
			if (result === 'in-use') throw new CredentialError('CREDENTIALS_IN_USE');
			if (result === 'missing') throw new CredentialError('CREDENTIALS_NOT_FOUND');
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
				inserted = await this.#storage.addReference(owner, key, id);
			}

			// 提交前保留旧和新引用。跨插件写入中断时，缓存的引用最多过于保守。
			let result: T;
			try {
				this.#signal.throwIfAborted();
				result = await save();
			} catch (cause) {
				if (id && inserted && !this.#signal.aborted && !signal?.aborted)
					await this.#storage.removeReference(owner, key, id);
				throw cause;
			}

			await this.#storage.pruneReferences(owner, key, id);
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
		const row = await this.#storage.getMaterial(id);
		this.#signal.throwIfAborted();
		if (!row) throw new CredentialError('CREDENTIALS_NOT_FOUND');
		const clear = await this.#crypto.decrypt(row.material, cryptoOptions);
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

	async #encode(input: CredentialInput): Promise<StoredCredential> {
		this.#keyMaterial(input);
		const clear = new TextEncoder().encode(JSON.stringify(input));
		try {
			const result = await this.#crypto.encrypt(clear, cryptoOptions);
			if (result.isErr()) throw new CredentialError('CREDENTIALS_OPERATION_FAILED', { cause: result.error });
			return {
				name: input.name,
				username: input.username,
				type: input.type,
				material: result.value,
				hasPassphrase: input.type === 'privateKey' && Boolean(input.passphrase),
			};
		} finally {
			clear.fill(0);
		}
	}
}
