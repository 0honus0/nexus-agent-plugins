import { createHash } from 'node:crypto';

/** The complete immutable result stays in Host content; only the model projection is shortened. */
export function resultPreview(operationId, text, configuredBytes) {
	// Preserve the existing envelope allowance for very small user-selected budgets.
	const limit = Math.max(1024, configuredBytes);
	if (operationId === null || Buffer.byteLength(text) <= limit) {
		return text;
	}
	const characters = [];
	let bytes = 2;
	let nextOffset = 0;
	for (const character of text) {
		const cost = Buffer.byteLength(JSON.stringify(character)) - 2;
		if (bytes + cost > limit - 512) {
			break;
		}
		characters.push(character);
		bytes += cost;
		nextOffset++;
	}
	return JSON.stringify({
		kind: 'captured_result_preview',
		truncated: true,
		projection: {
			toolCallId: operationId,
			sha256: createHash('sha256').update(text).digest('hex'),
			originalBytes: Buffer.byteLength(text),
			offset: 0,
			nextOffset,
			text: characters.join(''),
		},
	});
}
