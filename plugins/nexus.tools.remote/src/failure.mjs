import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

export class RemoteToolFailure extends AgentFailure {
	constructor(code) {
		super(code);
		this.code = code;
	}
}
