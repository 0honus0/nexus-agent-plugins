import { z } from 'zod';

export const RemoteFilePathSchema = z
	.string()
	.min(1)
	.max(4096)
	.startsWith('/')
	.refine((value) => !/[\x00-\x1f\x7f]/u.test(value));

export const ArchiveFormatSchema = z.enum(['zip', 'tar.gz', 'tar.bz2']);

export type ArchiveFormat = z.infer<typeof ArchiveFormatSchema>;

export const ArchiveInputSchema = z.strictObject({
	paths: z.array(RemoteFilePathSchema).min(1).max(256),
	destination: RemoteFilePathSchema,
	format: ArchiveFormatSchema,
	password: z
		.string()
		.min(1)
		.max(1024)
		.refine((value) => !value.includes('\0'))
		.optional(),
	overwrite: z.boolean().default(false),
});

export type ArchiveInput = z.input<typeof ArchiveInputSchema>;

export const ExtractInputSchema = ArchiveInputSchema.omit({ paths: true }).extend({
	archive: RemoteFilePathSchema,
});

export type ExtractInput = z.input<typeof ExtractInputSchema>;

/** Validated archive metadata; link paths are resolved before native extraction. */
export interface ArchiveEntry {
	kind: 'file' | 'directory' | 'symlink';
	hardlink: boolean;
	size: number;
	mode: number | null;
	rawName: string;
	linkTarget: string | null;
}

export interface ArchiveLinkTarget {
	destination: string;
	directories: string[];
}

export interface ArchiveHardlink {
	target: string;
	size: number;
}
