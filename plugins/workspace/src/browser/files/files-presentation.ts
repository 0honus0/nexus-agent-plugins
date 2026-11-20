import { workspacePaneScale } from '../../shared/workspace-layout-types';
import type { PanePresentation } from '../presentation/pane-presentation';

export const filesPresentation = {
	id: 'files',
	minimumViewport: { minimumWidth: 200, minimumHeight: 180 },
	scale: workspacePaneScale,
} satisfies PanePresentation;
