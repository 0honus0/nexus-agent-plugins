import { HttpFailure, type PluginContextApi, type PluginScopeApi } from 'nexus-terminal/node';
import { z } from 'zod';
import {
	ConnectionCatalogResponseSchema,
	ConnectionIdSchema,
	ConnectionUpdateSchema,
	ConnectionWriteSchema,
} from '../shared/connection-http-types.js';
import { ConnectionSchema } from '../shared/connection-types.js';
import { ConnectionError, type Connections } from './connections-api.js';

const empty = z.strictObject({});

export function registerConnectionsHttp(app: PluginContextApi['app'], service: Connections, lifetime: PluginScopeApi) {
	async function handle<Result>(run: () => Promise<Result>, signal: AbortSignal): Promise<Result> {
		try {
			signal.throwIfAborted();
			return await run();
		} catch (cause) {
			signal.throwIfAborted();
			if (cause instanceof ConnectionError)
				throw new HttpFailure(cause.code === 'CONNECTIONS_INVALID_REQUEST' ? 400 : 404, cause.code);
			if (cause instanceof Error && 'code' in cause && cause.code === 'CREDENTIALS_NOT_FOUND')
				throw new HttpFailure(409, 'CREDENTIALS_NOT_FOUND');
			app.log.report({ level: 'error', code: 'CONNECTIONS_OPERATION_FAILED' });
			throw new HttpFailure(500, 'CONNECTIONS_OPERATION_FAILED');
		}
	}

	app.http.register([
		{
			method: 'get',
			path: '/catalog',
			input: empty,
			output: ConnectionCatalogResponseSchema,
			lifetime,

			handler: (_, signal) => handle(() => service.listWithRevision(), signal),
		},
		{
			method: 'get',
			path: '/connections/:id',
			input: ConnectionIdSchema,
			output: ConnectionSchema,
			lifetime,

			handler: ({ id }: z.infer<typeof ConnectionIdSchema>, signal) =>
				handle(async () => {
					const value = await service.get(id);
					if (!value) throw new ConnectionError('CONNECTIONS_NOT_FOUND');
					return value;
				}, signal),
		},
		{
			method: 'post',
			path: '/connections',
			input: ConnectionWriteSchema,
			output: ConnectionSchema,
			status: 201,
			lifetime,

			handler: ({ connection }: z.infer<typeof ConnectionWriteSchema>, signal) =>
				handle(() => service.create(connection, signal), signal),
		},
		{
			method: 'put',
			path: '/connections/:id',
			input: ConnectionUpdateSchema,
			output: ConnectionSchema,
			lifetime,

			handler: ({ id, connection }: z.infer<typeof ConnectionUpdateSchema>, signal) =>
				handle(() => service.update(id, connection, signal), signal),
		},
		{
			method: 'delete',
			path: '/connections/:id',
			input: ConnectionIdSchema,
			output: empty,
			status: 204,
			lifetime,

			async handler({ id }: z.infer<typeof ConnectionIdSchema>, signal) {
				await handle(() => service.remove(id, signal), signal);
				return {};
			},
		},
		{
			method: 'delete',
			path: '/tags/:id',
			input: ConnectionIdSchema,
			output: empty,
			status: 204,
			lifetime,

			async handler({ id }: z.infer<typeof ConnectionIdSchema>, signal) {
				await handle(() => service.removeTag(id, signal), signal);
				return {};
			},
		},
	] as const);
}
