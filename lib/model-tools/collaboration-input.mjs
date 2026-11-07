import { RESULT_PAGE_MAX_BYTES } from './limits.mjs';
import { AGENT_CHILD_PROFILES } from '@nexus-terminal/shared/agent/collaboration/values';
import { AGENT_ID_PATTERN } from '@nexus-terminal/shared/agent/values';
import { AgentFailure } from './failure.mjs';

function string(value) {
	if (typeof value !== 'string') {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function number(value) {
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function ids(value) {
	if (value === void 0) {
		return [];
	}
	if (!Array.isArray(value) || !value.length) {
		throw new AgentFailure('invalid_input');
	}
	const result = value.map((item) => string(item));
	if (result.some((id) => !AGENT_ID_PATTERN.test(id)) || new Set(result).size !== result.length) {
		throw new AgentFailure('invalid_input');
	}
	return result;
}

function targetIds(value) {
	if (value === void 0) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new AgentFailure('invalid_input');
	}
	return value.map((item) => {
		if (typeof item !== 'string' || !/^[1-9][0-9]*$/.test(item) || !Number.isSafeInteger(Number(item))) {
			throw new AgentFailure('invalid_input');
		}
		return Number(item);
	});
}

function collaborationInput(name, value) {
	if (name === 'collaboration_delegate') {
		const targets = targetIds(value.targets);
		const profile = AGENT_CHILD_PROFILES.find((item) => item === value.profile);
		const objective = string(value.objective);
		if (!profile || !objective.trim()) {
			throw new AgentFailure('invalid_input');
		}
		const dependencyMode = value.dependencyMode;
		if (
			new Set(targets).size !== targets.length ||
			(dependencyMode !== 'success' && dependencyMode !== 'settled')
		) {
			throw new AgentFailure('invalid_input');
		}
		return {
			action: 'delegate',
			profile,
			objective,
			targets,
			dependencies: ids(value.dependencies),
			dependencyMode,
		};
	}
	if (name === 'collaboration_list') {
		const after = value.after === void 0 ? null : string(value.after);
		if (after !== null && !AGENT_ID_PATTERN.test(after)) {
			throw new AgentFailure('invalid_input');
		}
		return { action: 'list', after, limit: value.limit === void 0 ? 16 : number(value.limit) };
	}
	if (name === 'collaboration_output_read') {
		const childId = string(value.childId);
		if (!AGENT_ID_PATTERN.test(childId)) {
			throw new AgentFailure('invalid_input');
		}
		const maxBytes = number(value.maxBytes);
		if (maxBytes < 8 || maxBytes > RESULT_PAGE_MAX_BYTES) {
			throw new AgentFailure('invalid_input');
		}
		return { action: 'output_read', childId, offset: number(value.offset), maxBytes };
	}
	if (name === 'collaboration_cancel') {
		return { action: 'cancel', childIds: ids(value.childIds) };
	}
	if (name === 'collaboration_join') {
		if (value.mode !== 'all' && value.mode !== 'any') {
			throw new AgentFailure('invalid_input');
		}
		return {
			action: 'join',
			childIds: ids(value.childIds),
			mode: value.mode,
			waitSeconds: number(value.waitSeconds),
		};
	}
	if (name === 'collaboration_message_send') {
		const recipientId = string(value.recipientId);
		if (!AGENT_ID_PATTERN.test(recipientId)) {
			throw new AgentFailure('invalid_input');
		}
		return { action: 'send', recipientId, body: string(value.body), ttlSeconds: number(value.ttlSeconds) };
	}
	if (name === 'collaboration_message_read') {
		return { action: 'read', after: number(value.after), limit: number(value.limit) };
	}
	if (name === 'collaboration_message_consume') {
		return { action: 'consume', through: number(value.through), expectedConsumed: number(value.expectedConsumed) };
	}
	if (name === 'collaboration_fact_read') {
		return { action: 'fact_read', key: string(value.key) };
	}
	if (name === 'collaboration_fact_write') {
		return {
			action: 'fact_write',
			key: string(value.key),
			value: string(value.value),
			expectedVersion: number(value.expectedVersion),
		};
	}
	throw new AgentFailure('invalid_input');
}

export { collaborationInput };
