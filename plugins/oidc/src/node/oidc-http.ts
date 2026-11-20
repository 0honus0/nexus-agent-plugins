import { parseCookie } from 'cookie';
import type { PluginContextApi } from 'nexus-terminal/node';
import { z } from 'zod';
import {
	EmptySchema,
	OidcAuthorizationSchema,
	OidcBindingAuthorizationSchema,
	OidcBindingFinishSchema,
	OidcBindingInputSchema,
	OidcConfigInputSchema,
	OidcStartSchema,
	OidcStatusSchema,
} from '../shared/oidc-http-types.js';
import { oidcFlowLifetime, type OidcService } from './oidc-service.js';

const cookieName = 'nexus.oidc';

function cookieOptions(path: string, origin: string) {
	return { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), path } as const;
}

export function registerOidcHttp(context: PluginContextApi, service: OidcService) {
	if (!context.authMethods) throw new Error('OIDC_AUTH_METHOD_UNAVAILABLE');
	const method = context.authMethods.register({
		id: 'oidc',
		label: 'oidc',
		routes: [
			{
				method: 'post',
				path: '/start',
				input: OidcStartSchema,
				output: OidcAuthorizationSchema,

				async handler({ origin }: z.output<typeof OidcStartSchema>, signal, request) {
					const { authorizationUrl, transaction } = await service.start(origin, callbackPath, signal);
					request.setCookie(cookieName, transaction, {
						...cookieOptions(callbackPath, origin),
						maxAge: oidcFlowLifetime,
					});
					return { authorizationUrl };
				},
			},
			{
				method: 'get',
				path: '/callback',
				callback: true,
				input: z.object({}),
				output: EmptySchema,

				async handler(_input, signal, request) {
					const transaction = parseCookie(request.cookieHeader ?? '')[cookieName];
					const verified = await service.verify(transaction, request.url, signal);
					if (verified) {
						verified.assertCurrent();
						request.setCookie(cookieName, '', {
							...cookieOptions(callbackPath, verified.origin),
							maxAge: 0,
						});
						await request.completeLogin();
						verified.assertCurrent();
						request.redirect('/');
					} else {
						context.app.log.report({ level: 'warn', code: 'OIDC_LOGIN_FAILED' });
						request.redirect('/login?oidc=failed');
					}
					return {};
				},
			},
		],
	});
	const callbackPath = method.baseURL + 'callback';

	context.app.http.register([
		{
			method: 'post',
			path: '/binding/start',
			input: OidcBindingInputSchema,
			output: OidcBindingAuthorizationSchema,

			handler: (input: z.output<typeof OidcBindingInputSchema>, signal) => service.startBinding(input, signal),
		},
		{
			method: 'post',
			path: '/binding/finish',
			input: OidcBindingFinishSchema,
			output: OidcStatusSchema,

			async handler({ transaction, query }: z.output<typeof OidcBindingFinishSchema>, signal) {
				await service.finishBinding(transaction, query, signal);
				return { config: service.config, callbackPath };
			},
		},
		{
			method: 'get',
			path: '/configuration',
			input: EmptySchema,
			output: OidcStatusSchema,

			handler: () => ({ config: service.config, callbackPath }),
		},
		{
			method: 'put',
			path: '/configuration',
			input: OidcConfigInputSchema,
			output: OidcStatusSchema,

			async handler(config: z.output<typeof OidcConfigInputSchema>, signal) {
				await service.save(config, signal);
				return { config: service.config, callbackPath };
			},
		},
		{
			method: 'delete',
			path: '/configuration',
			input: EmptySchema,
			output: OidcStatusSchema,

			async handler(_input, signal) {
				await service.remove(signal);
				return { config: null, callbackPath };
			},
		},
	]);
}
