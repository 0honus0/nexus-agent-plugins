import type { PanePresentation } from '../presentation/pane-presentation';

/** Status constraints: the five-row summary remains readable at 180×200 CSS px.
 * CSS container queries select the actual content layout, never a JavaScript width tier.
 */
export const statusPresentation = {
	id: 'status',
	minimumViewport: { minimumWidth: 180, minimumHeight: 200 },
	scale: { min: 0.65, max: 1.6, step: 0.1 },
} satisfies PanePresentation;
