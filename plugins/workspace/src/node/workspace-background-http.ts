import { WorkspaceError } from './workspace-error';
import { z } from 'zod';
import {
	BackgroundDeleteSchema,
	BackgroundPresetWriteSchema,
	BackgroundSettingsWriteSchema,
	BackgroundVersionHeaderSchema,
} from '../shared/workspace-background-http-types';
import { BackgroundSnapshotSchema, backgroundImageLimit } from '../shared/workspace-background-types';

import type { WorkspaceBackgroundStorage } from './workspace-background-storage.js';
import { workspaceHttp } from './workspace-http-options.js';
import type { HttpStreamContext, PluginHttpApi, PluginLogApi, PluginScopeApi } from 'nexus-terminal/node';
import { Readable } from 'node:stream';

const imageInput = z.object({ id: z.uuid() });

const getAppearanceInput = z.strictObject({});

const putAppearancePresetsIdInput = BackgroundPresetWriteSchema.safeExtend({ id: z.uuid() });

const deleteAppearancePresetsIdInput = BackgroundDeleteSchema.safeExtend({ id: z.uuid() });

export function registerWorkspaceAppearanceHttp(
	http: PluginHttpApi,
	service: WorkspaceBackgroundStorage,
	log: PluginLogApi,
	lifetime: PluginScopeApi,
): void {
	http.register([
		{
			method: 'get',
			path: '/appearance',
			input: getAppearanceInput,
			output: BackgroundSnapshotSchema,
			status: 200,
			lifetime,

			handler: (_input: z.output<typeof getAppearanceInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return service.snapshot();
				}),
		},
		{
			method: 'patch',
			path: '/appearance/settings',
			input: BackgroundSettingsWriteSchema,
			output: BackgroundSnapshotSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof BackgroundSettingsWriteSchema>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version, value } = input;
					return service.settings(version, value);
				}),
		},
		{
			method: 'delete',
			path: '/appearance/image',
			input: BackgroundDeleteSchema,
			output: BackgroundSnapshotSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof BackgroundDeleteSchema>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version } = input;
					return service.removeImage(version);
				}),
		},
		{
			method: 'post',
			path: '/appearance/presets',
			input: BackgroundPresetWriteSchema,
			output: BackgroundSnapshotSchema,
			status: 201,
			lifetime,

			handler: (input: z.output<typeof BackgroundPresetWriteSchema>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version, value } = input;
					return service.savePreset(undefined, version, value);
				}),
		},
		{
			method: 'put',
			path: '/appearance/presets/:id',
			input: putAppearancePresetsIdInput,
			output: BackgroundSnapshotSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof putAppearancePresetsIdInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version, value } = input;
					return service.savePreset(input.id, version, value);
				}),
		},
		{
			method: 'delete',
			path: '/appearance/presets/:id',
			input: deleteAppearancePresetsIdInput,
			output: BackgroundSnapshotSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof deleteAppearancePresetsIdInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { version } = input;
					return service.removePreset(input.id, version);
				}),
		},
		{
			method: 'get',
			path: '/appearance/image/:id',
			input: imageInput,
			lifetime,

			handler: (input: z.output<typeof imageInput>, context: HttpStreamContext) =>
				workspaceHttp(log, context.signal, async () => {
					const image = await service.image(input.id);
					await context.reply({
						headers: {
							'content-type': image.mime,
							'content-length': image.data.length,
							'cache-control': 'no-store',
						},
						body: Readable.from([image.data]),
					});
				}),
		},
		{
			method: 'put',
			path: '/appearance/image',
			body: 'binary',
			input: z.strictObject({}),
			lifetime,

			handler: (_input: unknown, context: HttpStreamContext) =>
				workspaceHttp(log, context.signal, async () => {
					const version = BackgroundVersionHeaderSchema.safeParse(context.headers['if-match']);
					if (!version.success || !context.body) throw new WorkspaceError('WORKSPACE_INVALID_REQUEST', 400);
					const chunks: Buffer[] = [];
					let bytes = 0;
					for await (const chunk of context.body) {
						context.signal.throwIfAborted();
						const buffer = Buffer.from(chunk);
						bytes += buffer.length;
						if (bytes > backgroundImageLimit)
							throw new WorkspaceError('WORKSPACE_BACKGROUND_IMAGE_INVALID', 413);
						chunks.push(buffer);
					}
					const snapshot = BackgroundSnapshotSchema.parse(
						await service.upload(version.data, Buffer.concat(chunks)),
					);
					await context.reply({
						headers: { 'content-type': 'application/json' },
						body: Readable.from([JSON.stringify(snapshot)]),
					});
				}),
		},
	] as const);
}
