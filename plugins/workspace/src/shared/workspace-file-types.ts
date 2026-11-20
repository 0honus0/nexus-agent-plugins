import { z } from 'zod';

/** Remote paths are interpreted by SFTP, never by a local shell or filesystem. */
export const RemotePathSchema = z
	.string()
	.min(1)
	.max(4096)
	.refine((v) => !v.includes('\0'));

export const FileEntrySchema = z.object({
	name: z.string(),
	path: RemotePathSchema,
	kind: z.enum(['directory', 'file', 'link', 'other']),
	size: z.number().nonnegative(),
	modifiedAt: z.number(),
	mode: z.number(),
});

export const DirectorySchema = z.object({
	path: RemotePathSchema,
	entries: z.array(FileEntrySchema),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;

export type RemoteDirectory = z.infer<typeof DirectorySchema>;

/** A single user-entered name, not a path. */
export const RemoteNameSchema = z
	.string()
	.min(1)
	.max(255)
	.refine((name) => !['.', '..'].includes(name) && !/[\/\0]/.test(name));

export const FileSearchEntrySchema = FileEntrySchema.extend({ relativePath: z.string() });

export const FileSearchResultSchema = z.object({
	entries: z.array(FileSearchEntrySchema),
	truncated: z.boolean(),
});

export type FileSearchEntry = z.infer<typeof FileSearchEntrySchema>;

export type FileSearchResult = z.infer<typeof FileSearchResultSchema>;
