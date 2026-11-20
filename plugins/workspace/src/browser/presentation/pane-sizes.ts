import { statusPresentation } from '../status/status-presentation';
import { filesPresentation } from '../files/files-presentation';
import type { WorkspacePane } from '../../shared/workspace-layout-types';

/** Content readability floors, independent of work-area size and local zoom.
 * Dockview aggregates these through the split tree; default pane ratios are separate.
 */
export const paneSizes = {
	terminal: { minimumWidth: 240, minimumHeight: 120 },
	files: filesPresentation.minimumViewport,
	commands: { minimumWidth: 200, minimumHeight: 160 },
	status: statusPresentation.minimumViewport,
} satisfies Record<WorkspacePane, { minimumWidth: number; minimumHeight: number }>;
