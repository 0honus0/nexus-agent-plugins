import { PluginHttpError, type AuthLoginActionApi, type PluginContextApi } from 'nexus-terminal/browser';
import { z } from 'zod';
import { OidcAuthorizationSchema, OidcOriginSchema } from '../shared/oidc-http-types.js';

const ErrorSchema = z.object({ code: z.string() });

export async function signInWithOidc({ baseURL, signal }: AuthLoginActionApi) {
	const origin = location.origin;
	if (!OidcOriginSchema.safeParse(origin).success) throw new Error('OIDC_ORIGIN_MISMATCH');
	const endpoint = new URL('start', new URL(baseURL, origin));
	const response = await fetch(endpoint, {
		method: 'POST',
		signal,
		credentials: 'same-origin',
		redirect: 'error',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ origin }),
	});
	if (!response.ok) {
		const error = ErrorSchema.safeParse(await response.json().catch(() => undefined));
		throw new PluginHttpError(response.status, error.data?.code ?? 'OIDC_LOGIN_FAILED');
	}
	const { authorizationUrl } = OidcAuthorizationSchema.parse(await response.json());
	signal.throwIfAborted();
	location.assign(authorizationUrl);
}

export function reportOidcFailure(context: PluginContextApi, cause: unknown, signal = context.signal) {
	if (signal.aborted || context.signal.aborted) return;
	const code =
		cause instanceof Error && /^OIDC_[A-Z_]+$/u.test(cause.message) ? cause.message : 'OIDC_OPERATION_FAILED';
	context.app.log.report({ level: 'warn', code, userVisible: true });
}
