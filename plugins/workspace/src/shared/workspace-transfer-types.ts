import { z } from 'zod';
import { ErrorDetailSchema } from './workspace-diagnostic-types.js';

export const TransferKindSchema = z.enum(['upload', 'download', 'copy', 'move', 'compress', 'extract']);

export const TransferStateSchema = z.enum([
	'queued',
	'preparing',
	'connecting',
	'transferring',
	'committing',
	'completed',
	'failed',
	'canceled',
	'unknown',
]);

export const TransferMethodSchema = z.enum(['http', 'sftp', 'rsync', 'scp', 'local']);

/** Bytes describe confirmed remote writes (uploads/copies) or bytes handed to HTTP (downloads).
 * Download completion does not assert that a browser saved the file to disk.
 * Unknown outcomes must never be retried automatically.
 */
export const TransferTaskSchema = z.object({
	id: z.uuid(),
	kind: TransferKindSchema,
	state: TransferStateSchema,
	label: z.string(),
	source: z.string(),
	destination: z.string(),
	sessionIds: z.array(z.uuid()),
	batchId: z.uuid().optional(),
	paths: z.array(z.string()),
	destinationPath: z.string(),
	bytes: z.number().nonnegative(),
	totalBytes: z.number().nonnegative().nullable(),
	completedItems: z.number().int().nonnegative(),
	totalItems: z.number().int().nonnegative(),
	currentFile: z.string(),
	speed: z.number().nonnegative(),
	method: TransferMethodSchema.optional(),
	fallback: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number(),
	retryable: z.boolean(),
	error: ErrorDetailSchema.optional(),
});

export type TransferTask = z.infer<typeof TransferTaskSchema>;

export type TransferKind = z.infer<typeof TransferKindSchema>;

export const TransferEventSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('snapshot'), tasks: z.array(TransferTaskSchema) }),
	z.object({ type: z.literal('changed'), tasks: z.array(TransferTaskSchema), removed: z.array(z.uuid()) }),
]);

export const isTransferFinished = (state: TransferTask['state']) =>
	['completed', 'failed', 'canceled', 'unknown'].includes(state);
