export type SshErrorCode =
	| 'SSH_AUTHENTICATION_FAILED'
	| 'SSH_CHANNEL_FAILED'
	| 'SSH_CONNECTION_CLOSED'
	| 'SSH_CONNECTION_FAILED'
	| 'SSH_CONNECTION_TIMEOUT'
	| 'SSH_HOST_KEY_REJECTED'
	| 'SSH_INVALID_OPTIONS'
	| 'SSH_OPERATION_CANCELLED'
	| 'SSH_PLUGIN_STOPPED'
	| 'SSH_PRIVATE_KEY_INVALID'
	| 'SSH_PRIVATE_KEY_REQUIRED';

export class SshError extends Error {
	override readonly name = 'SshError';

	constructor(
		readonly code: SshErrorCode,
		options?: ErrorOptions,
	) {
		super(code, options);
	}
}
