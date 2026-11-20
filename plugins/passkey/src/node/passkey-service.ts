import { randomBytes, randomUUID } from 'node:crypto';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { HttpFailure, type PluginContextApi } from 'nexus-terminal/node';
import { PasskeyNameSchema } from '../shared/passkey-http-types.js';
import { passkeyAuthenticatorNames } from './passkey-authenticators.js';
import { PasskeyStorage } from './passkey-storage.js';

export const passkeyCeremonyLifetime = 180_000;

interface Ceremony {
	readonly origin: string;
	readonly challenge: string;
}

class Ceremonies<Value extends Ceremony> {
	readonly #pending = new Map<string, Value & { expires: number }>();

	begin(ceremony: Value): string {
		const now = Date.now();
		for (const [id, entry] of this.#pending) if (entry.expires <= now) this.#pending.delete(id);
		if (this.#pending.size >= 256) throw new HttpFailure(429, 'PASSKEY_BUSY');
		const id = randomUUID();
		this.#pending.set(id, { ...ceremony, expires: now + passkeyCeremonyLifetime });
		return id;
	}

	consume(id: string | undefined): Value {
		const entry = id && this.#pending.get(id);
		if (id) this.#pending.delete(id);
		if (!entry || entry.expires <= Date.now()) throw new HttpFailure(400, 'PASSKEY_CHALLENGE_EXPIRED');
		return entry;
	}
}

export class PasskeyService {
	readonly storage: PasskeyStorage;
	readonly #registrations = new Ceremonies<Ceremony & { userHandle: string }>();
	readonly #authentications = new Ceremonies<Ceremony>();
	readonly #ownerHandle = randomBytes(32).toString('base64url');
	#readinessRevision = 0;

	constructor(private readonly context: PluginContextApi) {
		this.storage = new PasskeyStorage(context.app.database);
	}

	async refreshReadiness() {
		const revision = ++this.#readinessRevision;
		const registered = await this.storage.has();
		if (revision !== this.#readinessRevision || this.context.signal.aborted) return;
		this.context.self.readiness.set(
			registered
				? { state: 'ready' }
				: { state: 'pending', reason: { code: 'PLUGIN_CONFIGURATION_REQUIRED', applicationId: 'main' } },
		);
	}

	async startRegistration(origin: string, signal: AbortSignal) {
		const registered = await this.storage.registrationCredentials(origin);
		const userHandle = registered[0]?.user_handle ?? this.#ownerHandle;
		const options = await generateRegistrationOptions({
			rpName: 'Nexus Terminal',
			rpID: new URL(origin).hostname,
			userID: Uint8Array.from(Buffer.from(userHandle, 'base64url')),
			userName: 'owner',
			userDisplayName: 'Nexus Terminal',
			excludeCredentials: registered.map(({ id }) => ({ id })),
			authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
			attestationType: 'none',
			timeout: passkeyCeremonyLifetime,
		});
		signal.throwIfAborted();
		return {
			transaction: this.#registrations.begin({ origin, userHandle, challenge: options.challenge }),
			options,
		};
	}

	async finishRegistration(transaction: string, response: RegistrationResponseJSON, signal: AbortSignal) {
		const { origin, userHandle, challenge } = this.#registrations.consume(transaction);
		const result = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: origin,
			expectedRPID: new URL(origin).hostname,
			requireUserVerification: true,
		}).catch(() => undefined);
		signal.throwIfAborted();
		if (!result?.verified) throw new HttpFailure(400, 'PASSKEY_REGISTRATION_FAILED');
		const { aaguid, credential } = result.registrationInfo;
		const { id, publicKey, counter } = credential;
		const authenticator = passkeyAuthenticatorNames.get(aaguid.toLowerCase());
		const name = authenticator ? (PasskeyNameSchema.safeParse(`${authenticator} Passkey`).data ?? '') : '';
		const created = await this.storage.create(
			{
				id,
				name,
				origin,
				counter,
				public_key: publicKey,
				user_handle: userHandle,
				created_at: Date.now(),
			},
			signal,
		);
		if (!created) throw new HttpFailure(409, 'PASSKEY_ALREADY_REGISTERED');
		await this.refreshReadiness();
		return created;
	}

	async startAuthentication(origin: string, signal: AbortSignal) {
		if (!(await this.storage.has(origin))) throw new HttpFailure(401, 'PASSKEY_LOGIN_FAILED');
		const options = await generateAuthenticationOptions({
			rpID: new URL(origin).hostname,
			userVerification: 'required',
			timeout: passkeyCeremonyLifetime,
		});
		signal.throwIfAborted();
		return { transaction: this.#authentications.begin({ origin, challenge: options.challenge }), options };
	}

	async verifyAuthentication(
		transaction: string | undefined,
		response: AuthenticationResponseJSON,
		signal: AbortSignal,
	) {
		const { origin, challenge } = this.#authentications.consume(transaction);
		const credential = await this.storage.credential(response.id, origin);
		if (!credential || response.response.userHandle !== credential.user_handle)
			throw new HttpFailure(401, 'PASSKEY_LOGIN_FAILED');
		const { id, public_key, counter } = credential;
		const result = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge,
			expectedOrigin: origin,
			expectedRPID: new URL(origin).hostname,
			requireUserVerification: true,
			credential: { id, publicKey: Uint8Array.from(public_key), counter },
		}).catch(() => undefined);
		signal.throwIfAborted();
		if (
			!result?.verified ||
			!(await this.storage.advanceCounter(id, counter, result.authenticationInfo.newCounter, signal))
		)
			throw new HttpFailure(401, 'PASSKEY_LOGIN_FAILED');
	}
}
