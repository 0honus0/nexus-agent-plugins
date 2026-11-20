import { FilePathQuerySchema } from './workspace-file-http-types';
import { z } from 'zod';

export const TransferRetrySchema = z.strictObject({ overwrite: z.boolean().default(false) });

/** Transfer bodies remain raw binary. Query metadata cannot declare filesystem authority. */
export const TransferFileQuerySchema = z.object({
	overwrite: z.enum(['true', 'false']).default('false'),
	taskId: z.uuid().optional(),
	batchId: z.uuid().optional(),
	size: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});

export const FileDownloadQuerySchema = FilePathQuerySchema.extend(TransferFileQuerySchema.shape);

export const FileUploadHeadersSchema = z.object({
	'content-length': z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
});
