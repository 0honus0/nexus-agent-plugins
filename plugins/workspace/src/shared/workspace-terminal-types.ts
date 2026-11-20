import { z } from 'zod';
import { LayoutProfileSchema } from './layout-types.js';

export const terminalFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const TerminalFontSizeSchema = z.number().int().min(8).max(40);

const color = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Workspace-owned display preferences. Width profiles describe available app space, never device identity. */
export const TerminalDisplaySchema = z.strictObject({
	fontFamily: z.string().trim().min(1).max(500).default(terminalFontFamily),
	fontSizes: z.record(LayoutProfileSchema, TerminalFontSizeSchema).default({ compact: 13, medium: 13, wide: 13 }),
	stroke: z
		.strictObject({
			enabled: z.boolean().default(false),
			width: z.number().finite().min(0).max(2).default(0.5),
			color: color.default('#000000'),
		})
		.prefault({}),
	shadow: z
		.strictObject({
			enabled: z.boolean().default(false),
			offsetX: z.number().finite().min(-10).max(10).default(0),
			offsetY: z.number().finite().min(-10).max(10).default(1),
			blur: z.number().finite().min(0).max(20).default(2),
			color: color.default('#000000'),
		})
		.prefault({}),
});

export type TerminalDisplay = z.infer<typeof TerminalDisplaySchema>;
