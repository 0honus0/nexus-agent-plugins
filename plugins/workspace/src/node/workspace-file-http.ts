import { ArchiveInputSchema, ExtractInputSchema } from '@nexus-terminal/remote-tools/remote-file-types';
import { posix } from 'node:path';
import { z } from 'zod';
import {
	FileMutationRequestSchema,
	FilePathQuerySchema,
	FileSearchQuerySchema,
} from '../shared/workspace-file-http-types';
import {
	FilePermissionsSchema,
	FileRemoveSchema,
	FileTransferSchema,
	TerminalDirectorySchema,
} from '../shared/workspace-file-operation-types';
import { DirectorySchema, FileSearchResultSchema } from '../shared/workspace-file-types';
import { FileDownloadQuerySchema, FileUploadHeadersSchema } from '../shared/workspace-transfer-http-types';
import { TransferTaskSchema } from '../shared/workspace-transfer-types';
import { selectDownloadRange } from './workspace-download-range';
import { WorkspaceError } from './workspace-error';
import type { WorkspaceService } from './workspace-service';

/** File bodies bypass JSON parsing. Session authentication and source checks are inherited from the host. */
import { workspaceHttp } from './workspace-http-options.js';
import type { HttpStreamContext, PluginHttpApi, PluginLogApi, PluginScopeApi } from 'nexus-terminal/node';
import { PassThrough } from 'node:stream';

const getSessionsIdTerminalDirectoryInput = z.object({ id: z.uuid() });

const postSessionsIdTerminalDirectoryInput = TerminalDirectorySchema.safeExtend({ id: z.uuid() });

const postSessionsIdFilesTransferInput = FileTransferSchema.safeExtend({ id: z.uuid() });

const postSessionsIdFilesPermissionsInput = FilePermissionsSchema.safeExtend({ id: z.uuid() });

const postSessionsIdFilesRemoveInput = FileRemoveSchema.safeExtend({ id: z.uuid() });

const postSessionsIdFilesCompressInput = ArchiveInputSchema.safeExtend({ id: z.uuid() });

const postSessionsIdFilesExtractInput = ExtractInputSchema.safeExtend({ id: z.uuid() });

const getSessionsIdDirectoryInput = FilePathQuerySchema.safeExtend({ id: z.uuid() });

const getSessionsIdFilesSearchInput = FileSearchQuerySchema.safeExtend({ id: z.uuid() });

const getSessionsIdFileInput = FileDownloadQuerySchema.safeExtend({ id: z.uuid() });

export function registerWorkspaceFilesHttp(
	http: PluginHttpApi,
	service: WorkspaceService,
	log: PluginLogApi,
	lifetime: PluginScopeApi,
): void {
	http.register([
		{
			method: 'get',
			path: '/sessions/:id/terminal-directory',
			input: getSessionsIdTerminalDirectoryInput,
			output: TerminalDirectorySchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof getSessionsIdTerminalDirectoryInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return service.sessionFiles(input.id).directory.read(signal);
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/terminal-directory',
			input: postSessionsIdTerminalDirectoryInput,
			output: TerminalDirectorySchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof postSessionsIdTerminalDirectoryInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { path } = input;
					return service.sessionFiles(input.id).directory.change(path, signal);
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/files/transfer',
			input: postSessionsIdFilesTransferInput,
			output: TransferTaskSchema,
			status: 202,
			lifetime,

			handler: (input: z.output<typeof postSessionsIdFilesTransferInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return service.startFileTransfer(input.id, input);
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/files/permissions',
			input: postSessionsIdFilesPermissionsInput,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (input: z.output<typeof postSessionsIdFilesPermissionsInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					await service.files(input.id).chmod(input.paths, input.mode);

					return {};
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/files/remove',
			input: postSessionsIdFilesRemoveInput,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (input: z.output<typeof postSessionsIdFilesRemoveInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					await service.files(input.id).remove(input.paths, signal);

					return {};
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/files/compress',
			input: postSessionsIdFilesCompressInput,
			output: TransferTaskSchema,
			status: 202,
			lifetime,

			handler: (input: z.output<typeof postSessionsIdFilesCompressInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { id, ...body } = input;
					const session = service.sessionFiles(id);
					const task = service.transfers.start(
						{
							kind: 'compress',
							label: posix.basename(input.destination),
							source: session.name,
							destination: session.name,
							paths: input.paths,
							destinationPath: input.destination,
							sessionIds: [id],
						},
						async (progress) => {
							const current = service.sessionFiles(id);
							progress.update({ state: 'transferring', method: 'local' });
							await current.files.withTransfer(progress.signal, (_sftp, signal) =>
								current.remote.archives.compress(body, { signal }),
							);
							progress.update({ state: 'committing' });
						},
					);
					return task.task;
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/files/extract',
			input: postSessionsIdFilesExtractInput,
			output: TransferTaskSchema,
			status: 202,
			lifetime,

			handler: (input: z.output<typeof postSessionsIdFilesExtractInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { id, ...body } = input;
					const session = service.sessionFiles(id);
					const task = service.transfers.start(
						{
							kind: 'extract',
							label: posix.basename(input.archive),
							source: session.name,
							destination: session.name,
							paths: [input.archive],
							destinationPath: input.destination,
							sessionIds: [id],
						},
						async (progress) => {
							const current = service.sessionFiles(id);
							progress.update({ state: 'transferring', method: 'local' });
							await current.files.withTransfer(progress.signal, (_sftp, signal) =>
								current.remote.archives.extract(body, { signal }),
							);
							progress.update({ state: 'committing' });
						},
					);
					return task.task;
				}),
		},
		{
			method: 'get',
			path: '/sessions/:id/directory',
			input: getSessionsIdDirectoryInput,
			output: DirectorySchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof getSessionsIdDirectoryInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const files = service.files(input.id);
					return files.list(input.path, signal);
				}),
		},
		{
			method: 'get',
			path: '/sessions/:id/files/search',
			input: getSessionsIdFilesSearchInput,
			output: FileSearchResultSchema,
			status: 200,
			lifetime,

			handler: (input: z.output<typeof getSessionsIdFilesSearchInput>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					return service.files(input.id).search(input.path, input.query, signal);
				}),
		},
		{
			method: 'post',
			path: '/sessions/:id/files',
			input: FileMutationRequestSchema,
			output: z.strictObject({}),
			status: 204,
			lifetime,

			handler: (input: z.output<typeof FileMutationRequestSchema>, signal: AbortSignal) =>
				workspaceHttp(log, signal, async () => {
					const { id, mutation } = input;
					await service.files(id).mutate(mutation);

					return {};
				}),
		},
		{
			method: 'get',
			path: '/sessions/:id/file',
			input: getSessionsIdFileInput,
			lifetime,

			handler: (input: z.output<typeof getSessionsIdFileInput>, context: HttpStreamContext) =>
				workspaceHttp(log, context.signal, async () => {
					const { path, id, taskId } = input;
					const session = service.sessionFiles(id);
					const { size } = await session.files.stat(path);
					let range: ReturnType<typeof selectDownloadRange>;
					try {
						range = selectDownloadRange(context.headers.range, size);
					} catch (cause) {
						if (!(cause instanceof WorkspaceError)) throw cause;
						await context.reply({
							status: 416,
							headers: { 'content-range': 'bytes */' + size, 'accept-ranges': 'bytes' },
						});
						return;
					}
					const length = range ? range.end - range.start + 1 : size;
					const headers = {
						'content-type': 'application/octet-stream',
						'content-disposition':
							"attachment; filename*=UTF-8''" +
							encodeURIComponent(posix.basename(path)).replace(
								/['()*]/gu,
								(character) => '%' + character.charCodeAt(0).toString(16),
							),
						'content-length': length,
						'accept-ranges': 'bytes',
						...(range && { 'content-range': `bytes ${range.start}-${range.end}/${size}` }),
					};
					const status = range ? 206 : 200;
					if (context.method === 'HEAD') {
						await context.reply({ status, headers });
						return;
					}

					const body = new PassThrough();
					const controller = new AbortController();
					const active = AbortSignal.any([context.signal, controller.signal]);
					const task = service.transfers.start(
						{
							id: range ? undefined : taskId,
							kind: 'download',
							label: posix.basename(path),
							source: session.name,
							destination: '',
							paths: [path],
							destinationPath: '',
							sessionIds: [id],
							totalBytes: length,
						},
						(progress) => session.files.download(path, body, progress.signal, progress, range ?? undefined),
						{ signal: active },
					);
					const sending = context.reply({ status, headers, body }).catch((cause) => {
						controller.abort(cause);
						throw cause;
					});
					const downloading = task.done.catch((cause) => {
						body.destroy(cause);
						throw cause;
					});
					const results = await Promise.allSettled([sending, downloading]);
					const failure = results.find((item) => item.status === 'rejected');
					if (failure) throw failure.reason;
				}),
		},
		{
			method: 'put',
			path: '/sessions/:id/file',
			body: 'binary',
			input: getSessionsIdFileInput,
			lifetime,

			handler: (input: z.output<typeof getSessionsIdFileInput>, context: HttpStreamContext) =>
				workspaceHttp(log, context.signal, async () => {
					const { id, path, taskId, batchId, size, overwrite } = input;
					const session = service.sessionFiles(id);
					if (!context.body) throw new WorkspaceError('WORKSPACE_INVALID_REQUEST', 415);
					const headers = FileUploadHeadersSchema.safeParse(context.headers);
					if (!headers.success) throw new WorkspaceError('WORKSPACE_INVALID_REQUEST', 400);
					const declared = headers.data['content-length'] ?? size;
					if (size !== undefined && declared !== size)
						throw new WorkspaceError('WORKSPACE_TRANSFER_SIZE_MISMATCH', 400);
					const body = context.body;
					const task = service.transfers.start(
						{
							id: taskId,
							batchId,
							kind: 'upload',
							label: posix.basename(path),
							source: '',
							destination: session.name,
							paths: [path],
							destinationPath: posix.dirname(path),
							sessionIds: [id],
							totalBytes: declared,
						},
						(progress) =>
							session.files.upload(path, body, progress.signal, progress, declared, overwrite === 'true'),
						{ signal: context.signal },
					);
					await task.done;
					await context.reply({ status: 204 });
				}),
		},
	] as const);
}
