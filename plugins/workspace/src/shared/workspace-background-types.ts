import { z } from 'zod';

export const backgroundImageLimit = 5 * 1024 * 1024;

export const backgroundHtmlLimit = 256 * 1024;

export const BackgroundSettingsSchema = z.strictObject({
	enabled: z.boolean(),
	animation: z.boolean(),
	overlay: z.number().min(0).max(1),
	fit: z.enum(['cover', 'contain']),
	preset: z.string().min(1).max(120).nullable(),
});

export type BackgroundSettings = z.infer<typeof BackgroundSettingsSchema>;

export const defaultBackgroundSettings: BackgroundSettings = {
	enabled: false,
	animation: true,
	overlay: 0.35,
	fit: 'cover',
	preset: null,
};

export const BackgroundPresetInputSchema = z.strictObject({
	name: z.string().trim().min(1).max(120),
	html: z
		.string()
		.min(1)
		.max(backgroundHtmlLimit)
		.refine((value) => new TextEncoder().encode(value).byteLength <= backgroundHtmlLimit),
});

export const BackgroundPresetSchema = BackgroundPresetInputSchema.extend({
	id: z.uuid(),
	version: z.number().int().positive(),
});

export type BackgroundPreset = z.infer<typeof BackgroundPresetSchema>;

export const BackgroundImageSchema = z.object({
	id: z.uuid(),
	mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
	bytes: z.number().int().positive().max(backgroundImageLimit),
});

export const BackgroundSnapshotSchema = z.object({
	settings: BackgroundSettingsSchema,
	version: z.number().int().nonnegative(),
	image: BackgroundImageSchema.nullable(),
	presets: z.array(BackgroundPresetSchema),
});

export type BackgroundSnapshot = z.infer<typeof BackgroundSnapshotSchema>;
