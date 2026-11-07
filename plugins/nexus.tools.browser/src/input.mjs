import inputDefinitions from './input-definitions.json' with { type: 'json' };
import { browserInput } from '../../../lib/model-tools/browser-input.mjs';
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

function decodeBrowser(value, definition) {
	return { kind: 'browser', input: browserInput(definition.name, value) };
}

const modelDecoders = {
	browser_targets_list: (value, definition) => {
		return { kind: 'browser_targets' };
	},

	browser_open: decodeBrowser,
	browser_close: decodeBrowser,
	browser_snapshot: decodeBrowser,
	browser_screenshot: decodeBrowser,
	browser_console: decodeBrowser,
	browser_navigate: decodeBrowser,
	browser_back: decodeBrowser,
	browser_scroll: decodeBrowser,
	browser_press: decodeBrowser,
	browser_select: decodeBrowser,
	browser_wait: decodeBrowser,
	browser_click: decodeBrowser,
	browser_type: decodeBrowser,
	browser_upload: decodeBrowser,
	browser_download: decodeBrowser,
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

export function decodeInput(name, argumentsJson) {
	const definition = inputDefinitions.find((d) => d.name === name);
	if (!definition) {
		throw new AgentFailure('invalid_input');
	}
	return decodeModelArguments(definition, argumentsJson);
}
