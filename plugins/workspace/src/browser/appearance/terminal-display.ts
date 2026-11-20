import type { TerminalDisplay } from '../../shared/workspace-terminal-types';

/** Shared by the live xterm DOM renderer, local echo and the settings preview. */
export function terminalDisplayStyle(display: TerminalDisplay) {
	return {
		'--workspace-terminal-stroke-width': `${display.stroke.enabled ? display.stroke.width : 0}px`,
		'--workspace-terminal-stroke-color': display.stroke.color,
		'--workspace-terminal-shadow': display.shadow.enabled
			? `${display.shadow.offsetX}px ${display.shadow.offsetY}px ${display.shadow.blur}px ${display.shadow.color}`
			: 'none',
	};
}

/** Internal field-level edits must not replay unrelated optimistic values after a failed save. */
export type TerminalDisplayPatch = Partial<Omit<TerminalDisplay, 'fontSizes' | 'stroke' | 'shadow'>> & {
	fontSizes?: Partial<TerminalDisplay['fontSizes']>;
	stroke?: Partial<TerminalDisplay['stroke']>;
	shadow?: Partial<TerminalDisplay['shadow']>;
};

export function mergeTerminalDisplay(display: TerminalDisplay, patch: TerminalDisplayPatch): TerminalDisplay {
	return {
		...display,
		...patch,
		fontSizes: { ...display.fontSizes, ...patch.fontSizes },
		stroke: { ...display.stroke, ...patch.stroke },
		shadow: { ...display.shadow, ...patch.shadow },
	};
}
