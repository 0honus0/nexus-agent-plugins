import { HttpFailure, type PluginContextApi, type PluginScopeApi } from 'nexus-terminal/node';
import { z } from 'zod';
import {
	CredentialCreateSchema,
	CredentialIdSchema,
	CredentialUpdateSchema,
} from '../shared/credentials-http-types.js';
import { CredentialSchema, CredentialsSnapshotSchema } from '../shared/credentials-types.js';
import { CredentialError, type CredentialsApi } from './credentials-api.js';

const empty = z.strictObject({});

export function registerCredentialsHttp(
	app: PluginContextApi['app'],
	service: CredentialsApi,
	lifetime: PluginScopeApi,
) {
	async function handle<Result>(run: () => Promise<Result>, signal: AbortSignal): Promise<Result> {
		try {
			signal.throwIfAborted();
			return await run();
		} catch (cause) {
			signal.throwIfAborted();
			if (cause instanceof CredentialError) {
				const status =
					cause.code === 'CREDENTIALS_NOT_FOUND'
						? 404
						: cause.code === 'CREDENTIALS_IN_USE'
							? 409
							: cause.code === 'CREDENTIALS_OPERATION_FAILED'
								? 500
								: 400;
				throw new HttpFailure(status, cause.code);
			}
			app.log.report({ level: 'error', code: 'CREDENTIALS_OPERATION_FAILED' });
			throw new HttpFailure(500, 'CREDENTIALS_OPERATION_FAILED');
		}
	}

	app.http.register([
		{
			method: 'get',
			path: '/credentials',
			input: empty,
			output: CredentialsSnapshotSchema,
			lifetime,

			handler: (_, signal) => handle(() => service.list(), signal),
		},
		{
			method: 'get',
			path: '/credentials/:id',
			input: CredentialIdSchema,
			output: CredentialSchema,
			lifetime,

			handler: ({ id }: z.infer<typeof CredentialIdSchema>, signal) =>
				handle(async () => {
					const item = await service.get(id);
					if (!item) throw new CredentialError('CREDENTIALS_NOT_FOUND');
					return item;
				}, signal),
		},
		{
			method: 'post',
			path: '/credentials',
			input: CredentialCreateSchema,
			output: CredentialSchema,
			status: 201,
			lifetime,

			handler: ({ credential }: z.infer<typeof CredentialCreateSchema>, signal) =>
				handle(() => service.create(credential, signal), signal),
		},
		{
			method: 'patch',
			path: '/credentials/:id',
			input: CredentialUpdateSchema,
			output: CredentialSchema,
			lifetime,

			handler: ({ id, patch }: z.infer<typeof CredentialUpdateSchema>, signal) =>
				handle(() => service.update(id, patch, signal), signal),
		},
		{
			method: 'delete',
			path: '/credentials/:id',
			input: CredentialIdSchema,
			output: empty,
			status: 204,
			lifetime,

			async handler({ id }: z.infer<typeof CredentialIdSchema>, signal) {
				await handle(() => service.remove(id, signal), signal);
				return {};
			},
		},
	] as const);
}
