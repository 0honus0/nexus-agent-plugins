export { describeWorkspaceError } from '../shared/workspace-diagnostic.js';

export class WorkspaceModuleError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}
