import { expect, it } from 'vitest';
import { TerminalDisplaySchema } from '../src/shared/workspace-terminal-types';
import { WorkspacePreferencesSchema } from '../src/shared/workspace-catalog-types';
import { terminalDisplayStyle } from '../src/browser/appearance/terminal-display';

it('loads older preferences with independent terminal display defaults', () => {
	const preferences = WorkspacePreferencesSchema.parse({ theme: null });
	expect(preferences.display.fontSizes).toEqual({ compact: 13, medium: 13, wide: 13 });
	expect(preferences.display.stroke.enabled).toBe(false);
	expect(preferences.display.shadow.enabled).toBe(false);
	preferences.display.fontSizes.compact = 20;
	expect(WorkspacePreferencesSchema.parse({ theme: null }).display.fontSizes.compact).toBe(13);
});

it('rejects incomplete width profiles, invalid dimensions and non-color CSS', () => {
	for (const value of [
		{ fontFamily: ' ' },
		{ fontSizes: { compact: 13, wide: 13 } },
		{ fontSizes: { compact: 7, medium: 13, wide: 41 } },
		{ stroke: { width: -1 } },
		{ shadow: { blur: 21 } },
		{ shadow: { color: 'var(--ui-text)' } },
	])
		expect(TerminalDisplaySchema.safeParse(value).success).toBe(false);
});

it('disables effects without discarding their saved values', () => {
	const display = TerminalDisplaySchema.parse({
		stroke: { enabled: true, width: 0.4, color: '#123456' },
		shadow: { enabled: true, offsetX: -2, offsetY: 3, blur: 4, color: '#654321' },
	});
	expect(terminalDisplayStyle(display)).toEqual({
		'--workspace-terminal-stroke-width': '0.4px',
		'--workspace-terminal-stroke-color': '#123456',
		'--workspace-terminal-shadow': '-2px 3px 4px #654321',
	});
	display.stroke.enabled = false;
	display.shadow.enabled = false;
	expect(terminalDisplayStyle(display)).toMatchObject({
		'--workspace-terminal-stroke-width': '0px',
		'--workspace-terminal-shadow': 'none',
	});
	expect(display.stroke.width).toBe(0.4);
	expect(display.shadow.blur).toBe(4);
});
