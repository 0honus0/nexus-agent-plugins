import { z } from 'zod';
import { TransferRetrySchema } from '../shared/workspace-transfer-http-types';
import { TransferTaskSchema } from '../shared/workspace-transfer-types';
import { SessionCreateSchema, SessionListResponseSchema, SessionSchema } from '../shared/workspace-types';
import type { WorkspaceService } from './workspace-service.js';

import { workspaceHttp } from './workspace-http-options.js';
import type { PluginHttpApi, PluginLogApi, PluginScopeApi } from 'nexus-terminal/node';
import { SessionCreateResultSchema } from '../shared/workspace-types.js';
import { WorkspaceError } from './workspace-error.js';

const postTransfersIdCancelInput = z.object({ id: z.uuid() });

const postTransfersIdRetryInput = TransferRetrySchema.safeExtend({ id: z.uuid() });

const deleteTransfersHistoryInput = z.strictObject({});

export function registerWorkspaceSessionHttp(
	http: PluginHttpApi,
	service: WorkspaceService,
	log: PluginLogApi,
	lifetime: PluginScopeApi,
): void {
	http.register([
		{
			method: 'post',
			path: '/transfers/:id/cancel',
			input: postTransfersIdCancelInput,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (input: z.output<typeof postTransfersIdCancelInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					service.transfers.cancel(input.id);

					return {};
				}),
		},
		{
			method: 'post',
			path: '/transfers/:id/retry',
			input: postTransfersIdRetryInput,
			output: TransferTaskSchema,
			status: 202,
			lifetime,

			handler: (input: z.output<typeof postTransfersIdRetryInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return service.transfers.retry(input.id, input.overwrite);
				}),
		},
		{
			method: 'delete',
			path: '/transfers/history',
			input: deleteTransfersHistoryInput,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (_input: z.output<typeof deleteTransfersHistoryInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					service.transfers.clear();

					return {};
				}),
		},
		{
			method: 'get',
			path: '/sessions',
			input: deleteTransfersHistoryInput,
			output: SessionListResponseSchema,
			status: 200,
			lifetime,

			handler: (_input: z.output<typeof deleteTransfersHistoryInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return { items: service.list() };
				}),
		},
		{
			method: 'post',
			path: '/sessions',
			input: SessionCreateSchema,
			output: SessionCreateResultSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof SessionCreateSchema>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					try {
						return { result: { state: 'created' as const, session: await service.create(input, signal) } };
					} catch (cause) {
						if (cause instanceof WorkspaceError && cause.fingerprint)
							return {
								result: {
									state: 'confirm-host' as const,
									fingerprint: cause.fingerprint,
									previousFingerprint: cause.previousFingerprint,
								},
							};
						throw cause;
					}
				}),
		},
		{
			method: 'delete',
			path: '/sessions/:id',
			input: postTransfersIdCancelInput,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (input: z.output<typeof postTransfersIdCancelInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					await service.close(input.id);

					return {};
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/suspend',
			input: postTransfersIdCancelInput,
			output: SessionSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof postTransfersIdCancelInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return service.suspend(input.id);
				}),
		},
	] as const);
}
