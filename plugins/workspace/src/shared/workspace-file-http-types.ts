import { z } from 'zod';
import { RemotePathSchema } from './workspace-file-types';

export const FilePathQuerySchema = z.object({ path: RemotePathSchema });

export const FileMutationSchema = z.discriminatedUnion('operation', [
	z.strictObject({ operation: z.enum(['mkdir', 'file']), path: RemotePathSchema }),
	z.strictObject({
		operation: z.literal('rename'),
		path: RemotePathSchema,
		destination: RemotePathSchema,
	}),
	// Directory deletion is deliberately non-recursive; symlinks are unlinked, never followed.
	z.strictObject({ operation: z.literal('remove'), path: RemotePathSchema }),
]);

export type FileMutation = z.infer<typeof FileMutationSchema>;

export const FileSearchQuerySchema = FilePathQuerySchema.extend({
	query: z.string().trim().min(1).max(255),
});

export const FileMutationRequestSchema = z.strictObject({ id: z.uuid(), mutation: FileMutationSchema });
