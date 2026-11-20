import { expect, it } from 'vitest';
import { paneSizes } from '../src/browser/presentation/pane-sizes';
import { statusPresentation } from '../src/browser/status/status-presentation';

it('uses the compact summary readability floor instead of a percentage of the work area', () => {
	expect(paneSizes.status).toEqual({ minimumWidth: 180, minimumHeight: 200 });
	expect(paneSizes.status).toBe(statusPresentation.minimumViewport);
	// Zoom and work-area measurements must never participate in constraints.
	expect(statusPresentation).not.toHaveProperty('minimum');
});

it('keeps independent floors for other panes', () => {
	expect(paneSizes.files).toEqual({ minimumWidth: 200, minimumHeight: 180 });
	expect(paneSizes.commands).toEqual({ minimumWidth: 200, minimumHeight: 160 });
});
