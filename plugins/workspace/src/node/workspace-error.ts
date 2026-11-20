import type { WorkspaceErrorCode } from '../shared/workspace-error-types.js';
import { describeWorkspaceError } from '../shared/workspace-diagnostic.js';

export { describeWorkspaceError };

export class WorkspaceError extends Error {
	constructor(
		readonly code: WorkspaceErrorCode,
		readonly status = 400,
		readonly fingerprint?: string,
		readonly previousFingerprint?: string,
	) {
		super(code);
	}
}

export function describeWorkspaceRequestError(cause: unknown, operation: string) {
	return describeWorkspaceError(cause, operation, 'WORKSPACE_OPERATION_FAILED');
}

export function describeWorkspaceStatusError(cause: unknown) {
	return describeWorkspaceError(cause, 'status', 'WORKSPACE_STATUS_UNAVAILABLE');
}
