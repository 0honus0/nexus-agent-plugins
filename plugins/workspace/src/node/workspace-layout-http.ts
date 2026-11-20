import { LayoutProfileSchema } from '../shared/layout-types.js';
import { z } from 'zod';
import { WorkspaceLayoutResponseSchema, WorkspaceLayoutSchema } from '../shared/workspace-layout-types';

import type { WorkspaceLayoutStorage } from './workspace-layout-storage.js';
import { workspaceHttp } from './workspace-http-options.js';
import type { PluginHttpApi, PluginLogApi, PluginScopeApi } from 'nexus-terminal/node';

const getLayoutsProfileInput = z.object({ profile: LayoutProfileSchema });

const putLayoutsProfileInput = WorkspaceLayoutSchema.safeExtend({ profile: LayoutProfileSchema });

export function registerWorkspaceLayoutsHttp(
	http: PluginHttpApi,
	layouts: WorkspaceLayoutStorage,
	log: PluginLogApi,
	lifetime: PluginScopeApi,
): void {
	http.register([
		{
			method: 'get',
			path: '/layouts/:profile',
			input: getLayoutsProfileInput,
			output: WorkspaceLayoutResponseSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof getLayoutsProfileInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const profile = input.profile;
					// Dockview uses structural types; the endpoint validates the complete JSON wire shape.
					return { layout: await layouts.get(profile) } as z.input<typeof WorkspaceLayoutResponseSchema>;
				}),
		},
		{
			method: 'put',
			path: '/layouts/:profile',
			input: putLayoutsProfileInput,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (input: z.output<typeof putLayoutsProfileInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { profile, ...layout } = input;
					await layouts.save(profile, layout);

					return {};
				}),
		},
	] as const);
}
