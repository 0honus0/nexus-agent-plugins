import { ErrorCodeSchema, ErrorDetailSchema, type ErrorDetail } from './workspace-diagnostic-types.js';

export function describeWorkspaceError(cause: unknown, operation: string, fallback: string): ErrorDetail {
	if (cause && typeof cause === 'object' && 'code' in cause) {
		const code = ErrorCodeSchema.safeParse(cause.code);
		if (code.success) {
			const source =
				typeof code.data === 'number'
					? 'sftp'
					: code.data.startsWith('SSH_')
						? 'ssh'
						: code.data.startsWith('REMOTE_TOOLS_')
							? 'remote-tools'
							: 'workspace';
			const detail = ErrorDetailSchema.safeParse({
				source,
				operation,
				code: code.data,
				level: 'level' in cause ? cause.level : undefined,
			});
			if (detail.success) return detail.data;
		}
	}
	return { source: 'workspace', operation, code: fallback };
}
