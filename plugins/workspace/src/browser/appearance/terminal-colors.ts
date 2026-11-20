import type { TerminalTheme } from '../../shared/workspace-catalog-types';
import { defaultTerminalColors } from '../../shared/terminal-theme-presets';

/** Partial imported palettes inherit terminal defaults, never host UI colors. */
export function resolveTerminalColors(colors?: TerminalTheme['colors']) {
	return {
		...defaultTerminalColors,
		...colors,
		cursor: colors?.cursor ?? colors?.foreground ?? defaultTerminalColors.cursor,
		cursorAccent: colors?.cursorAccent ?? colors?.background ?? defaultTerminalColors.cursorAccent,
	};
}
