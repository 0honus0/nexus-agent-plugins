import { z } from 'zod';
import {
	CatalogDeleteSchema,
	CatalogWriteSchema,
	PreferencesWriteSchema,
} from '../shared/workspace-catalog-http-types';
import { CatalogResourceSchema, WorkspaceCatalogSchema } from '../shared/workspace-catalog-types';

import type { WorkspaceCatalogStorage } from './workspace-catalog-storage.js';
import { workspaceHttp } from './workspace-http-options.js';
import type { PluginHttpApi, PluginLogApi, PluginScopeApi } from 'nexus-terminal/node';

const getCatalogInput = z.strictObject({});

const postCatalogCommandsIdUseInput = z.object({ id: z.uuid() });

const postCatalogKindInput = CatalogWriteSchema.safeExtend({ kind: CatalogResourceSchema });

const putCatalogKindIdInput = CatalogWriteSchema.safeExtend({ kind: CatalogResourceSchema, id: z.uuid() });

const deleteCatalogKindIdInput = CatalogDeleteSchema.safeExtend({ kind: CatalogResourceSchema, id: z.uuid() });

export function registerWorkspaceCatalogHttp(
	http: PluginHttpApi,
	catalog: WorkspaceCatalogStorage,
	log: PluginLogApi,
	lifetime: PluginScopeApi,
): void {
	http.register([
		{
			method: 'get',
			path: '/catalog',
			input: getCatalogInput,
			output: WorkspaceCatalogSchema,
			status: 200,
			lifetime,

			handler: (_input: z.output<typeof getCatalogInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return catalog.snapshot();
				}),
		},
		{
			method: 'put',
			path: '/catalog/preferences',
			input: PreferencesWriteSchema,
			output: WorkspaceCatalogSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof PreferencesWriteSchema>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version, ...value } = input;
					return catalog.preferences(version, value);
				}),
		},
		{
			method: 'post',
			path: '/catalog/commands/:id/use',
			input: postCatalogCommandsIdUseInput,
			output: WorkspaceCatalogSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof postCatalogCommandsIdUseInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return catalog.used(input.id);
				}),
		},
		{
			method: 'post',
			path: '/catalog/:kind',
			input: postCatalogKindInput,
			output: WorkspaceCatalogSchema,
			status: 201,
			lifetime,

			handler: (input: z.output<typeof postCatalogKindInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version, value } = input;
					return catalog.save(input.kind, undefined, version, value);
				}),
		},
		{
			method: 'put',
			path: '/catalog/:kind/:id',
			input: putCatalogKindIdInput,
			output: WorkspaceCatalogSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof putCatalogKindIdInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version, value } = input;
					return catalog.save(input.kind, input.id, version, value);
				}),
		},
		{
			method: 'delete',
			path: '/catalog/:kind/:id',
			input: deleteCatalogKindIdInput,
			output: WorkspaceCatalogSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof deleteCatalogKindIdInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version } = input;
					return catalog.remove(input.kind, input.id, version);
				}),
		},
	] as const);
}
