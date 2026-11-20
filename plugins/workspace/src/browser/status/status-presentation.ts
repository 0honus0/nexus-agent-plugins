import type { PanePresentation } from '../presentation/pane-presentation';
import { workspacePaneScale } from '../../shared/workspace-layout-types';

/** Status constraints: the five-row summary remains readable at 180×200 CSS px.
 * CSS container queries select the actual content layout, never a JavaScript width tier.
 */
export const statusPresentation = {
	id: 'status',
	minimumViewport: { minimumWidth: 180, minimumHeight: 200 },
	scale: workspacePaneScale,
} satisfies PanePresentation;
