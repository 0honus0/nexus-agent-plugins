import { HttpFailure, type PluginLogApi } from 'nexus-terminal/node';
import { WorkspaceError, describeWorkspaceError } from './workspace-error.js';

export async function workspaceHttp<Result>(
	log: PluginLogApi,
	signal: AbortSignal | undefined,
	work: () => Result | Promise<Result>,
): Promise<Result> {
	signal?.throwIfAborted();
	try {
		return await work();
	} catch (cause) {
		signal?.throwIfAborted();
		if (cause instanceof WorkspaceError) throw new HttpFailure(cause.status, cause.code);
		const error = describeWorkspaceError(cause, 'request', 'WORKSPACE_OPERATION_FAILED');
		const code = String(error.code);
		if (error.source === 'sftp') {
			if (error.code === 2) throw new HttpFailure(404, 'WORKSPACE_FILE_NOT_FOUND');
			if (error.code === 3) throw new HttpFailure(403, 'WORKSPACE_FILE_PERMISSION_DENIED');
		}
		if (/^(SSH|REMOTE_TOOLS)_[A-Z0-9_]+$/u.test(code)) throw new HttpFailure(502, code);
		log.report({ level: 'error', code: 'WORKSPACE_OPERATION_FAILED', params: { causeCode: code } });
		throw new HttpFailure(500, 'WORKSPACE_OPERATION_FAILED');
	}
}
