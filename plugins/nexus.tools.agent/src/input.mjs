import inputDefinitions from './input-definitions.json' with { type: 'json' };
import {
	AGENT_MEMORY_MAX_CONTENT_BYTES,
	hasAgentMemoryContentCapacity,
} from '@nexus-terminal/shared/agent/memory/values';
import { AGENT_ARTIFACT_MAX_BYTES } from '@nexus-terminal/shared/agent/artifacts/values';
import { isAgentPluginVersion } from '@nexus-terminal/shared/agent/plugins/values';
import { collaborationInput } from '../../../lib/model-tools/collaboration-input.mjs';
import { RESULT_PAGE_MAX_BYTES, RESULT_PAGE_DEFAULT_BYTES } from '../../../lib/model-tools/limits.mjs';
import { AGENT_ID_PATTERN } from '@nexus-terminal/shared/agent/values';
import { AgentFailure } from '../../../lib/model-tools/failure.mjs';
import { TOOL_ARGUMENT_MAX_BYTES } from '../../../lib/model-tools/limits.mjs';
import { isWellFormedFileText } from '@nexus-terminal/shared/remote/files/text-codec';

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toolArguments(input) {
	if (Buffer.byteLength(input, 'utf8') > TOOL_ARGUMENT_MAX_BYTES) {
		throw new AgentFailure('limit_exceeded');
	}
	let value;
	try {
		value = JSON.parse(input);
	} catch {
		throw new AgentFailure('invalid_input');
	}
	if (!isRecord(value)) {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function integer(value, minimum, maximum) {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function text(value, maxBytes, allowEmpty = false) {
	if (
		typeof value !== 'string' ||
		(!allowEmpty && !value) ||
		!isWellFormedFileText(value) ||
		value.includes('\0') ||
		Buffer.byteLength(value, 'utf8') > maxBytes
	) {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function texts(value, maxItems, maxItemBytes) {
	if (!Array.isArray(value) || !value.length || value.length > maxItems) {
		throw new AgentFailure('invalid_input');
	}
	return value.map((item) => text(item, maxItemBytes, true));
}

function validateFields(fields, value) {
	if (Object.keys(value).some((key) => !fields.some((field) => field.name === key))) {
		throw new AgentFailure('invalid_input');
	}
	for (const field of fields) {
		if (value[field.name] === void 0 && !field.required) {
			continue;
		}
		if (field.kind === 'objects') {
			const items = value[field.name];
			if (!Array.isArray(items) || !items.length || items.length > field.maxItems) {
				throw new AgentFailure('invalid_input');
			}
			for (const item of items) {
				if (!isRecord(item)) {
					throw new AgentFailure('invalid_input');
				}
				validateFields(field.fields, item);
			}
		} else if (field.kind === 'texts') {
			texts(value[field.name], field.maxItems, field.maxItemBytes);
		} else if (field.kind === 'integer') {
			integer(value[field.name], field.minimum, field.maximum);
		} else {
			const entry = text(value[field.name], field.maxBytes, field.allowEmpty);
			if (field.choices !== void 0 && !field.choices.includes(entry)) {
				throw new AgentFailure('invalid_input');
			}
		}
	}
}

function decodeCollaboration(value, definition) {
	return { kind: 'collaboration', input: collaborationInput(definition.name, value) };
}

const modelDecoders = {
	tool_search: (value, definition) => {
		const query = text(value.query, TOOL_ARGUMENT_MAX_BYTES).trim();
		if (!query) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'tool_search', query };
	},

	image_models_list: (value, definition) => {
		return {
			kind: 'image_models',
			offset: value.offset === void 0 ? 0 : integer(value.offset, 0, Number.MAX_SAFE_INTEGER - 20),
		};
	},

	image_generate: (value, definition) => {
		const providerId = text(value.providerId, 36);
		if (!AGENT_ID_PATTERN.test(providerId)) {
			throw new AgentFailure('invalid_input');
		}
		return {
			kind: 'image_generate',
			input: {
				providerId,
				configurationVersion: integer(value.configurationVersion, 1, Number.MAX_SAFE_INTEGER),
				modelId: text(value.modelId, 512),
				prompt: text(value.prompt, TOOL_ARGUMENT_MAX_BYTES),
			},
		};
	},

	skill_search: (value, definition) => {
		const query = text(value.query, TOOL_ARGUMENT_MAX_BYTES).trim();
		if (!query) {
			throw new AgentFailure('invalid_input');
		}
		return {
			kind: 'skill',
			input: {
				action: 'search',
				query,
				limit: value.limit === void 0 ? 8 : integer(value.limit, 1, Number.MAX_SAFE_INTEGER),
			},
		};
	},

	skill_read: (value, definition) => {
		const name = text(value.name, 64),
			version = text(value.version, 64),
			sha256 = text(value.sha256, 64);
		if (
			!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) ||
			!isAgentPluginVersion(version) ||
			!/^[a-f0-9]{64}$/u.test(sha256)
		) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'skill', input: { action: 'read', name, version, sha256 } };
	},

	context_checkpoint: (value, definition) => {
		return { kind: 'checkpoint', summary: text(value.summary, TOOL_ARGUMENT_MAX_BYTES) };
	},

	artifact_create: (value, definition) => {
		return {
			kind: 'artifact',
			action: 'create',
			name: text(value.name, 256),
			content: text(value.content, TOOL_ARGUMENT_MAX_BYTES, true),
		};
	},

	artifact_present: (value, definition) => {
		const artifactIds = texts(value.artifactIds, Number.MAX_SAFE_INTEGER, 36);
		if (new Set(artifactIds).size !== artifactIds.length || artifactIds.some((id) => !AGENT_ID_PATTERN.test(id))) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'artifact', action: 'present', artifactIds };
	},

	artifact_read: (value, definition) => {
		const artifactId = text(value.artifactId, 36);
		if (!AGENT_ID_PATTERN.test(artifactId)) {
			throw new AgentFailure('invalid_input');
		}
		return {
			kind: 'artifact',
			action: 'read',
			artifactId,
			offset: value.offset === void 0 ? 0 : integer(value.offset, 0, AGENT_ARTIFACT_MAX_BYTES),
			maxBytes:
				value.maxBytes === void 0
					? 4096
					: integer(value.maxBytes, value.encoding === 'utf8' ? 4 : 1, RESULT_PAGE_MAX_BYTES),
			encoding: value.encoding === 'utf8' ? 'utf8' : 'base64',
		};
	},

	memory_propose: (value, definition) => {
		const content = text(value.content, AGENT_MEMORY_MAX_CONTENT_BYTES);
		if (!hasAgentMemoryContentCapacity(content)) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'memory', action: 'propose', content };
	},

	memory_recall: (value, definition) => {
		const query = text(value.query, TOOL_ARGUMENT_MAX_BYTES);
		if (!query.trim()) {
			throw new AgentFailure('invalid_input');
		}
		return {
			kind: 'memory',
			action: 'recall',
			query,
			limit: value.limit === void 0 ? 10 : integer(value.limit, 1, Number.MAX_SAFE_INTEGER),
		};
	},

	tool_result_read: (value, definition) => {
		if (!Array.isArray(value.items) || !value.items.length) {
			throw new AgentFailure('invalid_input');
		}
		const items = value.items.map((item) => {
			if (!isRecord(item)) {
				throw new AgentFailure('invalid_input');
			}
			const toolCallId = text(item.toolCallId, 36),
				sha256 = text(item.sha256, 64);
			if (!AGENT_ID_PATTERN.test(toolCallId) || !/^[a-f0-9]{64}$/u.test(sha256)) {
				throw new AgentFailure('invalid_input');
			}
			return {
				toolCallId,
				sha256,
				offset: item.offset === void 0 ? 0 : integer(item.offset, 0, Number.MAX_SAFE_INTEGER),
				maxBytes:
					item.maxBytes === void 0
						? RESULT_PAGE_DEFAULT_BYTES
						: integer(item.maxBytes, 8, RESULT_PAGE_MAX_BYTES),
			};
		});
		return { kind: 'result', items };
	},

	collaboration_delegate: decodeCollaboration,
	collaboration_list: decodeCollaboration,
	collaboration_output_read: decodeCollaboration,
	collaboration_cancel: decodeCollaboration,
	collaboration_join: decodeCollaboration,
	collaboration_message_send: decodeCollaboration,
	collaboration_message_read: decodeCollaboration,
	collaboration_message_consume: decodeCollaboration,
	collaboration_fact_read: decodeCollaboration,
	collaboration_fact_write: decodeCollaboration,
};

function decodeModelArguments(definition, argumentsJson) {
	const value = toolArguments(argumentsJson);
	if (!('fields' in definition.input)) {
		throw new AgentFailure('invalid_input');
	}
	validateFields(definition.input.fields, value);
	const decode = modelDecoders[definition.name];
	if (!decode) {
		throw new AgentFailure('invalid_input');
	}
	return decode(value, definition);
}

export { decodeModelArguments, modelDecoders, toolArguments };

export function decodeInput(name, argumentsJson) {
	if (name === 'plugin_instances' || name === 'plugin_settings_read' || name === 'plugin_settings_write') {
		const value = toolArguments(argumentsJson);
		const allowed =
			name === 'plugin_instances'
				? []
				: name === 'plugin_settings_read'
					? ['instanceId']
					: ['instanceId', 'expectedPackageRevision', 'expectedRevision', 'schemaRevision', 'documentJson'];
		if (
			Object.keys(value).some((key) => !allowed.includes(key)) ||
			allowed.some((key) => !Object.hasOwn(value, key))
		) {
			throw new AgentFailure('invalid_input');
		}
		if (name === 'plugin_instances') {
			return { kind: 'plugin_instances' };
		}
		const instanceId = text(value.instanceId, 36);
		if (!AGENT_ID_PATTERN.test(instanceId)) {
			throw new AgentFailure('invalid_input');
		}
		if (name === 'plugin_settings_read') {
			return { kind: 'plugin_settings_read', instanceId };
		}
		return {
			kind: 'plugin_settings_write',
			instanceId,
			expectedPackageRevision: integer(value.expectedPackageRevision, 1, Number.MAX_SAFE_INTEGER),
			expectedRevision: integer(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER - 1),
			schemaRevision: integer(value.schemaRevision, 1, Number.MAX_SAFE_INTEGER),
			documentJson: text(value.documentJson, TOOL_ARGUMENT_MAX_BYTES),
		};
	}

	const definition = inputDefinitions.find((d) => d.name === name);
	if (!definition) {
		throw new AgentFailure('invalid_input');
	}
	return decodeModelArguments(definition, argumentsJson);
}
