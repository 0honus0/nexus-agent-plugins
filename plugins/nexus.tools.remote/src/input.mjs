import inputDefinitions from './input-definitions.json' with { type: 'json' };
import { AGENT_ARTIFACT_MAX_BYTES } from '@nexus-terminal/shared/agent/artifacts/values';
import { AGENT_EXECUTION_LIMIT_MAXIMA } from '@nexus-terminal/shared/agent/execution/values';
import { isAgentPluginVersion } from '@nexus-terminal/shared/agent/plugins/values';
import { RESULT_PAGE_MAX_BYTES } from '../../../lib/model-tools/limits.mjs';
import { AGENT_ID_PATTERN } from '@nexus-terminal/shared/agent/values';
import { DOCKER_ACTIONS } from '@nexus-terminal/shared/remote/docker/values';
import { REMOTE_FILE_MAX_PATH_BYTES } from '@nexus-terminal/shared/remote/files/values';
import { posix } from 'node:path';
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

function absolutePath(value, maxBytes) {
	const requested = text(value, maxBytes);
	if (!requested.startsWith('/') || requested.split('/').includes('..')) {
		throw new AgentFailure('invalid_input');
	}
	return posix.resolve(requested);
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

function decodeMachineDockerControl(value, definition) {
	const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
	const onError = value.onError ?? 'stop';
	if (onError !== 'stop' && onError !== 'continue') {
		throw new AgentFailure('invalid_input');
	}
	const items = value.items;
	if (!Array.isArray(items) || !items.length || items.some((item) => !isRecord(item))) {
		throw new AgentFailure('invalid_input');
	}
	const records = items.filter(isRecord);
	if (definition.name === 'machine_docker_control') {
		const operations2 = records.map((item) => {
			const containerId = text(item.containerId, 64),
				expectedFingerprint = text(item.expectedFingerprint, 64);
			const action = DOCKER_ACTIONS.find((candidate) => candidate === item.action);
			if (!action || !/^[a-f0-9]{64}$/.test(containerId) || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) {
				throw new AgentFailure('invalid_input');
			}
			return { containerId, expectedFingerprint, action };
		});
		if (new Set(operations2.map((item) => item.containerId)).size !== operations2.length) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'docker_control', connectionId, items: operations2, onError };
	}

	const pathFor = (item) => {
		const path = absolutePath(item.path, REMOTE_FILE_MAX_PATH_BYTES);
		if (path === '/' || /[\u0000-\u001f\u007f]/u.test(path)) {
			throw new AgentFailure('invalid_input');
		}
		return path;
	};

	const hashFor = (item) => {
		const hash = text(item.expectedFingerprint, 64);
		if (!/^[a-f0-9]{64}$/.test(hash)) {
			throw new AgentFailure('invalid_input');
		}
		return hash;
	};

	const paths = [];

	const addPath = (path) => {
		if (paths.some((other) => path === other || path.startsWith(other + '/') || other.startsWith(path + '/'))) {
			throw new AgentFailure('invalid_input');
		}
		paths.push(path);
	};

	if (definition.name === 'file_write') {
		const operations2 = records.map((item) => {
			const path = pathFor(item);
			addPath(path);
			const expectedSha256 = text(item.expectedSha256, 64);
			if (expectedSha256 !== 'absent' && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
				throw new AgentFailure('invalid_input');
			}
			return { path, content: text(item.content, TOOL_ARGUMENT_MAX_BYTES, true), expectedSha256 };
		});
		return { kind: 'write', connectionId, items: operations2, onError };
	}
	if (definition.name === 'file_move') {
		const operations2 = records.map((item) => {
			const path = pathFor(item),
				destinationPath = absolutePath(item.destinationPath, REMOTE_FILE_MAX_PATH_BYTES);
			if (destinationPath === '/' || /[\u0000-\u001f\u007f]/u.test(destinationPath)) {
				throw new AgentFailure('invalid_input');
			}
			addPath(path);
			addPath(destinationPath);
			return { path, destinationPath, expectedFingerprint: hashFor(item) };
		});
		return { kind: 'move', connectionId, items: operations2, onError };
	}
	const operations = records.map((item) => {
		const path = pathFor(item);
		addPath(path);
		const scope = item.scope;
		if (scope !== 'entry' && scope !== 'tree') {
			throw new AgentFailure('invalid_input');
		}
		return { path, expectedFingerprint: hashFor(item), scope };
	});
	return { kind: 'delete', connectionId, items: operations, onError };
}

function decodeFilePaths(value) {
	const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
	const paths = texts(value.paths, Number.MAX_SAFE_INTEGER, REMOTE_FILE_MAX_PATH_BYTES).map((item) =>
		absolutePath(item, 4096),
	);
	if (new Set(paths).size !== paths.length) {
		throw new AgentFailure('invalid_input');
	}
	return { kind: 'inspect', connectionId, paths };
}

const modelDecoders = {
	host_diagnostics_read: (value, definition) => {
		return { kind: 'host_diagnostics' };
	},

	machine_connection_list: (value, definition) => {
		return { kind: 'connections' };
	},

	project_directory_bind: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		return {
			kind: 'project',
			connectionId,
			input: { action: 'bind', directory: absolutePath(value.directory, REMOTE_FILE_MAX_PATH_BYTES) },
		};
	},

	project_directory_read: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		return {
			kind: 'project',
			connectionId,
			input: {
				action: 'read',
				path: value.path === void 0 ? null : absolutePath(value.path, REMOTE_FILE_MAX_PATH_BYTES),
			},
		};
	},

	project_directory_clear: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		return { kind: 'project', connectionId, input: { action: 'clear' } };
	},

	machine_diagnostics_read: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		return { kind: 'diagnostics', connectionId };
	},

	shell_execute: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		const cwd = value.cwd === void 0 ? null : absolutePath(value.cwd, REMOTE_FILE_MAX_PATH_BYTES);
		if (cwd !== null && /[\u0000-\u001f\u007f]/u.test(cwd)) {
			throw new AgentFailure('invalid_input');
		}
		const mode = value.mode === void 0 ? 'foreground' : value.mode;
		if (mode !== 'foreground' && mode !== 'background') {
			throw new AgentFailure('invalid_input');
		}
		const yieldSeconds =
			value.yieldSeconds === void 0
				? null
				: integer(value.yieldSeconds, 0, AGENT_EXECUTION_LIMIT_MAXIMA.toolTimeoutSeconds);
		if (mode === 'background' && yieldSeconds !== null) {
			throw new AgentFailure('invalid_input');
		}
		const commands = texts(value.commands, Number.MAX_SAFE_INTEGER, TOOL_ARGUMENT_MAX_BYTES);
		if (commands.some((command) => !command.trim())) {
			throw new AgentFailure('invalid_input');
		}
		const onError = value.onError ?? 'stop';
		if (onError !== 'stop' && onError !== 'continue') {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'shell', connectionId, commands, onError, cwd, mode, yieldSeconds };
	},

	shell_job_control: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		const action = value.action;
		if (
			action !== 'list' &&
			action !== 'status' &&
			action !== 'wait' &&
			action !== 'cancel' &&
			action !== 'output'
		) {
			throw new AgentFailure('invalid_input');
		}
		if (
			(action === 'list' && value.jobIds !== void 0) ||
			(action !== 'wait' && (value.waitSeconds !== void 0 || value.waitMode !== void 0)) ||
			(action !== 'list' && action !== 'output' && value.offset !== void 0)
		) {
			throw new AgentFailure('invalid_input');
		}
		const jobIds = action === 'list' ? [] : texts(value.jobIds, Number.MAX_SAFE_INTEGER, 36);
		if (new Set(jobIds).size !== jobIds.length || jobIds.some((id) => !AGENT_ID_PATTERN.test(id))) {
			throw new AgentFailure('invalid_input');
		}
		return {
			kind: 'job',
			connectionId,
			action,
			jobIds,
			waitMode: value.waitMode === 'any' ? 'any' : 'all',
			waitSeconds:
				action === 'wait' ? (value.waitSeconds === void 0 ? 10 : integer(value.waitSeconds, 1, 30)) : 0,
			offset:
				(action === 'list' || action === 'output') && value.offset !== void 0
					? integer(value.offset, 0, Number.MAX_SAFE_INTEGER - 64)
					: 0,
		};
	},

	machine_docker_inspect: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		const containerIds = texts(value.containerIds, Number.MAX_SAFE_INTEGER, 64);
		if (
			new Set(containerIds).size !== containerIds.length ||
			containerIds.some((id) => !/^[a-f0-9]{64}$/.test(id))
		) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'docker_inspect', connectionId, containerIds };
	},

	machine_docker_control: decodeMachineDockerControl,
	file_write: decodeMachineDockerControl,
	file_move: decodeMachineDockerControl,
	file_delete: decodeMachineDockerControl,
	file_inspect: decodeFilePaths,

	file_deliver: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		const paths = texts(value.paths, Number.MAX_SAFE_INTEGER, 4096).map((item) => absolutePath(item, 4096));
		if (
			new Set(paths).size !== paths.length ||
			paths.some((path) => path === '/' || /[\u0000-\u001f\u007f]/u.test(path))
		) {
			throw new AgentFailure('invalid_input');
		}
		return { kind: 'deliver', connectionId, paths };
	},

	file_patch: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		const path = absolutePath(value.path, 4096);
		if (/[\u0000-\u001f\u007f]/u.test(path) || path === '/') {
			throw new AgentFailure('invalid_input');
		}
		const expectedSha256 = text(value.expectedSha256, 64);
		if (!/^[a-f0-9]{64}$/.test(expectedSha256) || !Array.isArray(value.edits) || !value.edits.length) {
			throw new AgentFailure('invalid_input');
		}
		const edits = value.edits.map((item) => {
			if (!isRecord(item)) {
				throw new AgentFailure('invalid_input');
			}
			const oldText = text(item.oldText, TOOL_ARGUMENT_MAX_BYTES),
				newText = text(item.newText, TOOL_ARGUMENT_MAX_BYTES, true);
			if (oldText === newText) {
				throw new AgentFailure('invalid_input');
			}
			return { oldText, newText };
		});
		return { kind: 'patch', connectionId, path, expectedSha256, edits };
	},

	file_search: (value, definition) => {
		const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
		const path = absolutePath(value.path, 4096);
		const queries = texts(value.queries, Number.MAX_SAFE_INTEGER, TOOL_ARGUMENT_MAX_BYTES);
		if (
			new Set(queries).size !== queries.length ||
			queries.some((query) => !query || query.includes('\n') || query.includes('\r'))
		) {
			throw new AgentFailure('invalid_input');
		}
		return {
			kind: 'search',
			connectionId,
			path,
			queries,
			maxResults: value.maxResults === void 0 ? 20 : integer(value.maxResults, 1, Number.MAX_SAFE_INTEGER),
		};
	},
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
	const definition = inputDefinitions.find((d) => d.name === name);
	if (!definition) {
		throw new AgentFailure('invalid_input');
	}
	return decodeModelArguments(definition, argumentsJson);
}
