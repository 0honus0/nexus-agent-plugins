import { z } from 'zod';
import type { PluginHttpApi, PluginLogApi, PluginScopeApi } from 'nexus-terminal/node';
import { WorkspacePathHistorySchema, WorkspacePathHistoryWriteSchema } from '../shared/workspace-path-history-types';
import { workspaceHttp } from './workspace-http-options';
import type { WorkspaceStorage } from './workspace-storage';

const empty = z.strictObject({});

export function registerWorkspacePathHistoryHttp(
	http: PluginHttpApi,
	storage: WorkspaceStorage,
	log: PluginLogApi,
	lifetime: PluginScopeApi,
): void {
	http.register([
		{
			method: 'get',
			path: '/path-history',
			input: empty,
			output: WorkspacePathHistorySchema,
			lifetime,

			handler: (_input, signal) => workspaceHttp(log, signal, async () => ({ paths: await storage.listPaths() })),
		},
		{
			method: 'post',
			path: '/path-history',
			input: WorkspacePathHistoryWriteSchema,
			output: empty,
			status: 204,
			lifetime,

			handler: ({ path }: z.output<typeof WorkspacePathHistoryWriteSchema>, signal) =>
				workspaceHttp(log, signal, async () => {
					await storage.recordPath(path);
					return {};
				}),
		},
		{
			method: 'delete',
			path: '/path-history',
			input: WorkspacePathHistoryWriteSchema,
			output: empty,
			status: 204,
			lifetime,

			handler: ({ path }: z.output<typeof WorkspacePathHistoryWriteSchema>, signal) =>
				workspaceHttp(log, signal, async () => {
					await storage.removePath(path);
					return {};
				}),
		},
	] as const);
}
