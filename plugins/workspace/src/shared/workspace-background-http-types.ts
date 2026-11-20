import { z } from 'zod';
import { BackgroundPresetInputSchema, BackgroundSettingsSchema } from './workspace-background-types';

export const BackgroundSettingsWriteSchema = z.strictObject({
	version: z.number().int().nonnegative(),
	value: BackgroundSettingsSchema.partial(),
});

export const BackgroundPresetWriteSchema = z.strictObject({
	version: z.number().int().nonnegative(),
	value: BackgroundPresetInputSchema,
});

export const BackgroundDeleteSchema = z.strictObject({ version: z.number().int().nonnegative() });

export const BackgroundVersionHeaderSchema = z
	.string()
	.regex(/^(0|[1-9]\d*)$/)
	.transform(Number)
	.pipe(z.number().int().nonnegative().safe());

/** The limited image parser wraps its buffer; large file transfers never use this schema. */
export const BackgroundUploadSchema = z.object({ raw: z.instanceof(Uint8Array) });
