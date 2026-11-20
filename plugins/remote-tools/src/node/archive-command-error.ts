import { RemoteToolsError } from './remote-tools-error.js';
import type { NativeArchiveFailureReason } from './archive-command-types.js';

const archiveErrorCodes = {
	missing_tool: 'REMOTE_TOOLS_ARCHIVE_MISSING_TOOL',
	invalid_output: 'REMOTE_TOOLS_ARCHIVE_INVALID_OUTPUT',
	cleanup_failed: 'REMOTE_TOOLS_ARCHIVE_CLEANUP_FAILED',
	limit_exceeded: 'REMOTE_TOOLS_ARCHIVE_LIMIT_EXCEEDED',
	rejected: 'REMOTE_TOOLS_ARCHIVE_REJECTED',
	password_required: 'REMOTE_TOOLS_ARCHIVE_PASSWORD_REQUIRED',
	invalid_password: 'REMOTE_TOOLS_ARCHIVE_INVALID_PASSWORD',
} as const satisfies Record<
	NativeArchiveFailureReason,
	import('../shared/remote-tools-error-types.js').RemoteToolsErrorCode
>;

export class NativeArchiveFailure extends RemoteToolsError {
	override readonly name = 'NativeArchiveFailure';

	constructor(
		readonly reason: NativeArchiveFailureReason,
		readonly tool?: string,
		options?: ErrorOptions,
	) {
		super(archiveErrorCodes[reason], options);
	}
}

export class ZipStreamFailure extends RemoteToolsError {
	override readonly name = 'ZipStreamFailure';

	constructor(options?: ErrorOptions) {
		super('REMOTE_TOOLS_ARCHIVE_ZIP_STREAM_FAILED', options);
	}
}
