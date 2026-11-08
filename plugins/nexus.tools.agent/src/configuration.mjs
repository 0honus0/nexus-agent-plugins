import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

/** This instance owns recall policy. Host transport pages are independent of these totals. */
export function readRecallConfiguration(documentJson) {
	let value;
	try {
		value = JSON.parse(documentJson);
	} catch {
		throw new AgentFailure('invalid_input');
	}
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).length !== 2 ||
		!Number.isSafeInteger(value.maxRecallItems) ||
		value.maxRecallItems < 1 ||
		!Number.isSafeInteger(value.maxRecallBytes) ||
		value.maxRecallBytes < 1
	) {
		throw new AgentFailure('invalid_input');
	}
	return { maxRecallItems: value.maxRecallItems, maxRecallBytes: value.maxRecallBytes };
}
