import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
	WebAuthnAbortService,
} from '@simplewebauthn/browser';
import { PluginHttpError, type AuthLoginActionApi, type PluginContextApi } from 'nexus-terminal/browser';
import { z } from 'zod';
import {
	EmptySchema,
	PasskeyAuthenticationOptionsSchema,
	PasskeyOriginSchema,
	PasskeyRegistrationOptionsSchema,
	PasskeySchema,
} from '../shared/passkey-http-types.js';

export function passkeysSupported(): boolean {
	return isSecureContext && browserSupportsWebAuthn() && PasskeyOriginSchema.safeParse(location.origin).success;
}

function post(body: object, signal: AbortSignal): RequestInit {
	return { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

async function ceremony<Value>(signal: AbortSignal, run: () => Promise<Value>): Promise<Value> {
	signal.throwIfAborted();

	const cancel = () => WebAuthnAbortService.cancelCeremony();

	signal.addEventListener('abort', cancel, { once: true });
	try {
		const result = await run();
		signal.throwIfAborted();
		return result;
	} finally {
		signal.removeEventListener('abort', cancel);
	}
}

export async function registerPasskey(context: PluginContextApi, name: string, signal: AbortSignal) {
	if (!passkeysSupported()) throw new Error('PASSKEY_UNAVAILABLE');
	const { options, transaction } = await context.app.http.json(
		'/passkeys/options',
		PasskeyRegistrationOptionsSchema,
		post({ origin: location.origin, name }, signal),
	);
	const credential = await ceremony(signal, () => startRegistration({ optionsJSON: options }));
	return context.app.http.json('/passkeys/verify', PasskeySchema, post({ transaction, credential }, signal));
}

const ErrorSchema = z.object({ code: z.string() });

async function loginRequest<Schema extends z.ZodType>(
	action: AuthLoginActionApi,
	path: string,
	schema: Schema,
	body: object,
): Promise<z.output<Schema>> {
	// The host supplies the public auth namespace separately from the session-only plugin API.
	const response = await fetch(new URL(path, new URL(action.baseURL, location.origin)), {
		...post(body, action.signal),
		credentials: 'same-origin',
		redirect: 'error',
	});
	if (!response.ok) {
		const error = ErrorSchema.safeParse(await response.json().catch(() => undefined));
		throw new PluginHttpError(response.status, error.data?.code ?? 'PASSKEY_LOGIN_FAILED');
	}
	return schema.parse(await response.json());
}

export async function signInWithPasskey(action: AuthLoginActionApi) {
	if (!passkeysSupported()) throw new Error('PASSKEY_UNAVAILABLE');
	const { options } = await loginRequest(action, 'options', PasskeyAuthenticationOptionsSchema, {
		origin: location.origin,
	});
	const credential = await ceremony(action.signal, () => startAuthentication({ optionsJSON: options }));
	await loginRequest(action, 'verify', EmptySchema, { credential });
	await action.onComplete();
}

export function reportPasskeyFailure(context: PluginContextApi, cause: unknown, signal: AbortSignal) {
	if (signal.aborted || context.signal.aborted) return;
	const code =
		cause instanceof Error &&
		(cause.name === 'NotAllowedError' ||
			(cause.cause instanceof DOMException && cause.cause.name === 'NotAllowedError') ||
			('code' in cause && cause.code === 'ERROR_CEREMONY_ABORTED'))
			? 'PASSKEY_CANCELLED'
			: cause instanceof Error && /^PASSKEY_[A-Z_]+$/u.test(cause.message)
				? cause.message
				: 'PASSKEY_OPERATION_FAILED';
	context.app.log.report({ level: 'warn', code, userVisible: true });
}
