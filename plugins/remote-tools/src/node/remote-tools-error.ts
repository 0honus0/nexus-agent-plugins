import type { RemoteToolsErrorCode } from '../shared/remote-tools-error-types.js';

export class RemoteToolsError extends Error {
	override readonly name: string = 'RemoteToolsError';

	constructor(
		readonly code: RemoteToolsErrorCode,
		options?: ErrorOptions,
	) {
		super(code, options);
	}
}

export class RemoteCommandError extends Error {
	override readonly name = 'RemoteCommandError';
	readonly level = 'remote-exit';

	constructor(readonly code: number | null) {
		super(code === null ? 'REMOTE_TOOLS_COMMAND_FAILED' : String(code));
	}
}
