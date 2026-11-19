import { HttpFailure, type AuthMethodRoute, type PluginModuleApi } from 'nexus-terminal/node';
import { z } from 'zod';
import { EmptySchema } from '../../../src/sdk-fixture-types.js';

const finishInput = z.strictObject({ token: z.string() });
const finishOutput = z.strictObject({ ok: z.literal(true) });

export const activate: PluginModuleApi['activate'] = (context) => {
	context.provide('fixture', {
		read: () => 'node-provider',
	});

	const token = process.env.NEXUS_SDK_FIXTURE_TOKEN;
	if (token && context.authMethods) {
		const begin = {
			method: 'get',
			path: '/begin',
			callback: true,
			input: EmptySchema,
			output: EmptySchema,

			handler(_input, signal, request) {
				signal.throwIfAborted();
				if (!request.url.pathname.endsWith('/begin')) throw new HttpFailure(400, 'FIXTURE_URL_INVALID');
				request.setCookie('nexus-fixture', 'started', { httpOnly: true, sameSite: 'lax', path: '/' });
				request.redirect('/?fixture-callback=1');
				return {};
			},
		} satisfies AuthMethodRoute<typeof EmptySchema, typeof EmptySchema>;
		const registration = context.authMethods.register({
			id: 'fixture',
			label: 'Fixture login',
			routes: [
				begin,
				{
					method: 'post',
					path: '/finish',
					input: finishInput,
					output: finishOutput,

					async handler({ token: submitted }, signal, request) {
						signal.throwIfAborted();
						const started = request.cookieHeader?.split(/;\s*/u).includes('nexus-fixture=started');
						if (!started || submitted !== token) throw new HttpFailure(401, 'FIXTURE_TOKEN_INVALID');
						await request.completeLogin();
						return { ok: true as const };
					},
				},
			] as const,
		});

		context.app.http.register([
			{
				method: 'delete',
				path: '/method',
				input: EmptySchema,
				output: EmptySchema,

				async handler() {
					await registration.dispose();
					return {};
				},
			},
			{
				method: 'get',
				path: '/method',
				input: EmptySchema,
				output: z.strictObject({ baseURL: z.string() }),

				handler() {
					return { baseURL: registration.baseURL };
				},
			},
		] as const);
	}
	context.self.readiness.set({ state: 'ready' });
};
