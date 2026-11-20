import { expect, it } from 'vitest';
import { resolveTerminalColors } from '../src/browser/appearance/terminal-colors';
import { defaultTerminalColors, terminalThemePresets } from '../src/shared/terminal-theme-presets';
import { terminalColorKeys, ThemeInputSchema } from '../src/shared/workspace-catalog-types';
import { readTerminalThemeFile } from '../src/browser/appearance/terminal-theme-file';

it('provides a complete independent default palette', () => {
	const colors = resolveTerminalColors();
	expect(Object.keys(colors).sort()).toEqual([...terminalColorKeys].sort());
	expect(colors).toEqual(defaultTerminalColors);
	expect(colors).toMatchObject({ background: '#1e1e1e', foreground: '#d4d4d4', red: '#cd3131' });
	colors.background = '#ffffff';
	expect(resolveTerminalColors().background).toBe('#1e1e1e');
});

it('fills partial palettes without retaining colors from the previous selection', () => {
	const imported = { background: '#14212b', foreground: '#e3f1ff', blue: '#8ab4f8' };
	const colors = resolveTerminalColors(imported);
	expect(colors).toMatchObject({
		...imported,
		cursor: imported.foreground,
		cursorAccent: imported.background,
		red: defaultTerminalColors.red,
	});
	expect(imported).not.toHaveProperty('red');
	for (const preset of terminalThemePresets) {
		expect(resolveTerminalColors(preset.colors)).toEqual(preset.colors);
		expect(resolveTerminalColors()).toEqual(defaultTerminalColors);
	}
});

it('retains every legacy palette with unique stable ids and valid colors', () => {
	expect(terminalThemePresets).toHaveLength(403);
	expect(new Set(terminalThemePresets.map((theme) => theme.id)).size).toBe(403);
	for (const theme of terminalThemePresets) {
		expect(ThemeInputSchema.safeParse({ name: theme.name, colors: theme.colors }).success, theme.name).toBe(true);
	}
});

it('imports legacy plain palettes using the filename and retains current named exports', () => {
	const colors = { background: '#102030', foreground: '#fefefe', selectionBackground: '#33445566' };
	expect(readTerminalThemeFile(JSON.stringify(colors), 'Legacy.JSON')).toEqual([{ name: 'Legacy', colors }]);
	expect(readTerminalThemeFile(JSON.stringify({ name: 'Named', colors }), 'ignored.json')).toEqual([
		{ name: 'Named', colors },
	]);
	expect(readTerminalThemeFile(JSON.stringify([colors, { name: 'Named', colors }]), 'Mixed.json')).toEqual([
		{ name: 'Mixed', colors },
		{ name: 'Named', colors },
	]);
});

it('rejects invalid theme files in full before any entries can be saved', () => {
	const valid = { name: 'Valid', colors: { background: '#102030', foreground: '#ffffff' } };
	for (const input of [
		[valid, { name: 'Invalid', colors: { background: '#000000' } }],
		{ background: '#000000', foreground: 'url(https://example.test)' },
		{ ...valid.colors, unknown: '#000000' },
		[],
		Array.from({ length: 51 }, () => valid),
	])
		expect(() => readTerminalThemeFile(JSON.stringify(input), 'Invalid.json')).toThrow();
	expect(() => readTerminalThemeFile('{', 'Invalid.json')).toThrow();
});
