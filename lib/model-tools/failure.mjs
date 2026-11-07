/** Package-owned validation failure; SDK resource failures remain Host-owned. */
export class AgentFailure extends Error {
	constructor(code, options) {
		super(`Tool: ${code}`, options);
		this.name = 'ToolInputFailure';
		this.code = code;
	}
}
