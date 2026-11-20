import { randomUUID } from 'node:crypto';
import { HttpFailure, type PluginContextApi } from 'nexus-terminal/node';
import type { Configuration } from 'openid-client';
import { oidcBindingCallbackPath, type OidcBindingInput, type OidcConfigInput } from '../shared/oidc-http-types.js';
import {
	beginOidcAuthorization,
	discoverOidc,
	verifyOidcAuthorization,
	type OidcAuthorization,
} from './oidc-provider.js';
import { OidcStorage, secretContext, type StoredOidcConfig } from './oidc-storage.js';

export const oidcFlowLifetime = 300_000;

const cryptoOptions = { mode: 'local', context: secretContext } as const;

interface PendingLogin extends OidcAuthorization {
	readonly purpose: 'login';
	readonly config: StoredOidcConfig;
}

interface PendingBinding extends OidcAuthorization {
	readonly purpose: 'binding';
	readonly revision: number;
	readonly config: Omit<StoredOidcConfig, 'subject'>;
}

type PendingFlow = PendingLogin | PendingBinding;

export class OidcService {
	readonly #storage: OidcStorage;
	readonly #pending = new Map<string, PendingFlow & { expires: number }>();
	#config: StoredOidcConfig | undefined;
	#client: Promise<Configuration> | undefined;
	#revision = 0;
	#saving = false;

	constructor(private readonly context: PluginContextApi) {
		this.#storage = new OidcStorage(context.app.database);
	}

	async initialize() {
		this.#apply(await this.#storage.get());
	}

	get config() {
		if (!this.#config) return null;
		const { encryptedSecret: _secret, ...config } = this.#config;
		return config;
	}

	async save({ subject, ...input }: OidcConfigInput, signal: AbortSignal) {
		this.#beginWrite();
		try {
			const { config, client } = await this.#prepare(input, signal);
			await this.#saveConfig({ ...config, subject }, client, signal);
		} finally {
			this.#saving = false;
		}
	}

	async startBinding(input: OidcBindingInput, signal: AbortSignal) {
		if (this.#saving) throw new HttpFailure(409, 'OIDC_CONFIGURATION_CHANGED');
		const revision = this.#revision;
		const { config, client } = await this.#prepare(input, signal);
		const redirectUri = new URL(oidcBindingCallbackPath, config.origin).href;
		const { authorizationUrl, flow } = await beginOidcAuthorization(client, redirectUri);
		signal.throwIfAborted();
		if (revision !== this.#revision || this.#saving) throw new HttpFailure(409, 'OIDC_CONFIGURATION_CHANGED');
		const transaction = this.#remember({ ...flow, purpose: 'binding', config, revision });
		return { authorizationUrl, transaction };
	}

	async finishBinding(transaction: string, query: string, signal: AbortSignal) {
		const flow = this.#take(transaction, new URLSearchParams(query), 'binding');
		if (flow?.purpose !== 'binding') throw new HttpFailure(400, 'OIDC_BINDING_FAILED');
		const callback = new URL(flow.redirectUri);
		callback.search = query;
		const subject = await verifyOidcAuthorization(flow, callback);
		signal.throwIfAborted();
		if (flow.revision !== this.#revision) throw new HttpFailure(409, 'OIDC_CONFIGURATION_CHANGED');
		if (subject === undefined) throw new HttpFailure(400, 'OIDC_BINDING_FAILED');
		this.#beginWrite();
		try {
			await this.#saveConfig({ ...flow.config, subject }, flow.client, signal);
		} finally {
			this.#saving = false;
		}
	}

	async remove(signal: AbortSignal) {
		this.#beginWrite();
		try {
			await this.#storage.remove(signal);
			this.#apply(undefined);
		} finally {
			this.#saving = false;
		}
	}

	async start(origin: string, callbackPath: string, signal: AbortSignal) {
		const config = this.#config;
		if (!config || config.origin !== origin) throw new HttpFailure(400, 'OIDC_ORIGIN_MISMATCH');
		const client = await this.#resolveClient(config);
		const redirectUri = new URL(callbackPath, config.origin).href;
		const { authorizationUrl, flow } = await beginOidcAuthorization(client, redirectUri);
		signal.throwIfAborted();
		if (this.#config !== config) throw new HttpFailure(503, 'OIDC_CONFIGURATION_CHANGED');
		const transaction = this.#remember({ ...flow, purpose: 'login', config });
		return { authorizationUrl, transaction };
	}

	async verify(transaction: string | undefined, callback: URL, signal: AbortSignal) {
		if (!transaction) return;
		const flow = this.#take(transaction, callback.searchParams, 'login');
		if (flow?.purpose !== 'login' || flow.config !== this.#config) return;
		const subject = await verifyOidcAuthorization(flow, callback);
		signal.throwIfAborted();
		if (subject !== flow.config.subject || flow.config !== this.#config) return;
		return {
			origin: flow.config.origin,

			assertCurrent: () => {
				if (flow.config !== this.#config) throw new HttpFailure(503, 'OIDC_CONFIGURATION_CHANGED');
			},
		};
	}

	#remember(flow: PendingFlow) {
		const now = Date.now();
		for (const [id, entry] of this.#pending) if (entry.expires <= now) this.#pending.delete(id);
		if (this.#pending.size >= 256) throw new HttpFailure(429, 'OIDC_BUSY');
		const transaction = randomUUID();
		this.#pending.set(transaction, { ...flow, expires: now + oidcFlowLifetime });
		return transaction;
	}

	#take(transaction: string, query: URLSearchParams, purpose: PendingFlow['purpose']) {
		const flow = this.#pending.get(transaction);
		if (!flow || flow.purpose !== purpose || flow.expires <= Date.now()) return;
		const states = query.getAll('state');
		if (states.length !== 1 || states[0] !== flow.state) return;
		this.#pending.delete(transaction);
		return flow;
	}

	async #prepare({ clientSecret, ...config }: OidcBindingInput, signal: AbortSignal) {
		let encryptedSecret: Uint8Array | null = null;
		let secret: string | undefined;
		if (config.authMethod !== 'none') {
			const previous = this.#config;
			if (clientSecret) {
				secret = clientSecret;
				const result = await this.context.app.crypto.encrypt(new TextEncoder().encode(secret), cryptoOptions);
				if (result.isErr()) throw new HttpFailure(500, 'OIDC_SECRET_UNAVAILABLE');
				encryptedSecret = result.value;
			} else if (
				previous?.issuer === config.issuer &&
				previous.clientId === config.clientId &&
				previous.encryptedSecret
			) {
				encryptedSecret = previous.encryptedSecret;
				secret = await this.#decrypt(previous);
			} else throw new HttpFailure(400, 'OIDC_SECRET_REQUIRED');
		}
		signal.throwIfAborted();
		const client = await discoverOidc(config, secret);
		signal.throwIfAborted();
		return { config: { ...config, encryptedSecret }, client };
	}

	async #saveConfig(config: StoredOidcConfig, client: Configuration, signal: AbortSignal) {
		await this.#storage.save(config, signal);
		this.#apply(config, client);
	}

	#beginWrite() {
		if (this.#saving) throw new HttpFailure(409, 'OIDC_CONFIGURATION_CHANGED');
		this.#saving = true;
	}

	#apply(config: StoredOidcConfig | undefined, client?: Configuration) {
		this.context.signal.throwIfAborted();
		this.#revision++;
		this.#config = config;
		this.#client = client ? Promise.resolve(client) : undefined;
		this.#pending.clear();
		this.context.self.readiness.set(
			config
				? { state: 'ready' }
				: { state: 'pending', reason: { code: 'PLUGIN_CONFIGURATION_REQUIRED', applicationId: 'main' } },
		);
	}

	async #decrypt({ encryptedSecret }: StoredOidcConfig): Promise<string | undefined> {
		if (!encryptedSecret) return undefined;
		const result = await this.context.app.crypto.decrypt(encryptedSecret, cryptoOptions);
		if (result.isErr()) throw new HttpFailure(500, 'OIDC_SECRET_UNAVAILABLE');
		return new TextDecoder().decode(result.value);
	}

	#resolveClient(config: StoredOidcConfig): Promise<Configuration> {
		return (this.#client ??= this.#decrypt(config)
			.then((secret) => discoverOidc(config, secret))
			.catch((cause) => {
				if (this.#config === config) this.#client = undefined;
				throw cause;
			}));
	}
}
