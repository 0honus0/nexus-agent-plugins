import { AgentFailure } from '../../../lib/model-tools/failure.mjs';
import { definitions } from './definitions.mjs';

export function decodeInput(name, inputJson) {
	const definition = definitions.find((item) => item.key.endsWith('.' + name));
	const value = JSON.parse(inputJson);
	if (!definition || value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgentFailure('invalid_input');
	}
	// The Registry validates the provider-owned schema before entering this handler.
	if (name === 'acp_integration_list') {
		return { kind: name };
	}
	if (name === 'mcp_discover') {
		return { kind: name, instanceId: value.instanceId ?? null };
	}
	if (name === 'acp_execute') {
		return { kind: name, instanceId: value.instanceId, prompt: value.prompt };
	}
	return {
		kind: name,
		instanceId: value.instanceId,
		name: value.name,
		schemaHash: value.schemaHash,
		argumentsJson: value.argumentsJson,
		continuation: value.continuation,
		resume:
			value.resume === null
				? null
				: {
						requestState: value.resume.requestState,
						inputResponsesJson: value.resume.inputResponsesJson,
					},
	};
}
