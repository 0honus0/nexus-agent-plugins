import { z } from 'zod';
import { RemotePathSchema } from './workspace-file-types';

export const FileTransferSchema = z.strictObject({
	sourceSessionId: z.uuid(),
	paths: z.array(RemotePathSchema).min(1).max(256),
	destination: RemotePathSchema,
	move: z.boolean().default(false),
	overwrite: z.boolean().default(false),
});

export type FileTransfer = z.infer<typeof FileTransferSchema>;

export const FilePermissionsSchema = z.strictObject({
	paths: z.array(RemotePathSchema).min(1).max(256),
	mode: z.number().int().min(0).max(0o7777),
});

export const FileRemoveSchema = z.strictObject({
	paths: z.array(RemotePathSchema).min(1).max(256),
});

export const TerminalDirectorySchema = z.strictObject({ path: RemotePathSchema });

export const FileClipboardSchema = z.object({
	generation: z.uuid(),
	sourceSessionId: z.uuid(),
	paths: z.array(RemotePathSchema).min(1),
	operation: z.enum(['copy', 'cut']),
});

export type FileClipboard = z.infer<typeof FileClipboardSchema>;
