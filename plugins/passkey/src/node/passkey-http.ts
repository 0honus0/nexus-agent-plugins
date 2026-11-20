import { parseCookie } from 'cookie';
import { HttpFailure, type PluginContextApi } from 'nexus-terminal/node';
import type { z } from 'zod';
import {
	EmptySchema,
	PasskeyAuthenticationFinishSchema,
	PasskeyAuthenticationOptionsSchema,
	PasskeyAuthenticationStartSchema,
	PasskeyIdSchema,
	PasskeyListSchema,
	PasskeyRegistrationFinishSchema,
	PasskeyRegistrationOptionsSchema,
	PasskeyRegistrationStartSchema,
	PasskeySchema,
} from '../shared/passkey-http-types.js';
import { passkeyCeremonyLifetime, type PasskeyService } from './passkey-service.js';

const cookieName = 'nexus.passkey';

export function registerPasskeyHttp(context: PluginContextApi, service: PasskeyService) {
	if (!context.authMethods) throw new Error('PASSKEY_AUTH_METHOD_UNAVAILABLE');
	const method = context.authMethods.register({
		id: 'passkey',
		label: 'passkey',
		routes: [
			{
				method: 'post',
				path: '/options',
				input: PasskeyAuthenticationStartSchema,
				output: PasskeyAuthenticationOptionsSchema,

				async handler({ origin }: z.output<typeof PasskeyAuthenticationStartSchema>, signal, request) {
					const { transaction, options } = await service.startAuthentication(origin, signal);
					request.setCookie(cookieName, transaction, {
						httpOnly: true,
						sameSite: 'strict',
						secure: origin.startsWith('https:'),
						path: method.baseURL,
						maxAge: passkeyCeremonyLifetime,
					});
					return { options };
				},
			},
			{
				method: 'post',
				path: '/verify',
				input: PasskeyAuthenticationFinishSchema,
				output: EmptySchema,

				async handler({ credential }: z.output<typeof PasskeyAuthenticationFinishSchema>, signal, request) {
					const transaction = parseCookie(request.cookieHeader ?? '')[cookieName];
					await service.verifyAuthentication(transaction, credential, signal);
					await request.completeLogin();
					return {};
				},
			},
		],
	});

	context.app.http.register([
		{
			method: 'get',
			path: '/passkeys',
			input: EmptySchema,
			output: PasskeyListSchema,

			async handler() {
				return { items: await service.storage.list() };
			},
		},
		{
			method: 'post',
			path: '/passkeys/options',
			input: PasskeyRegistrationStartSchema,
			output: PasskeyRegistrationOptionsSchema,

			handler: ({ origin, name }: z.output<typeof PasskeyRegistrationStartSchema>, signal) =>
				service.startRegistration(origin, name, signal),
		},
		{
			method: 'post',
			path: '/passkeys/verify',
			input: PasskeyRegistrationFinishSchema,
			output: PasskeySchema,
			status: 201,

			handler: ({ transaction, credential }: z.output<typeof PasskeyRegistrationFinishSchema>, signal) =>
				service.finishRegistration(transaction, credential, signal),
		},
		{
			method: 'delete',
			path: '/passkeys/:id',
			input: PasskeyIdSchema,
			output: EmptySchema,
			status: 204,

			async handler({ id }: z.output<typeof PasskeyIdSchema>, signal) {
				if (!(await service.storage.remove(id, signal))) throw new HttpFailure(404, 'PASSKEY_NOT_FOUND');
				await service.refreshReadiness();
				return {};
			},
		},
	]);
}
