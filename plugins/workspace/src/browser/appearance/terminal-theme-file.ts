import { ThemeFileSchema, ThemeInputSchema } from '../../shared/workspace-catalog-types';

/** Legacy files contain only colors; use their filename as the theme name. Validate the whole file before saving. */
export function readTerminalThemeFile(text: string, filename: string) {
	return ThemeFileSchema.parse(JSON.parse(text)).map((entry) =>
		ThemeInputSchema.parse({ ...entry, name: entry.name ?? filename.replace(/\.json$/i, '') }),
	);
}
