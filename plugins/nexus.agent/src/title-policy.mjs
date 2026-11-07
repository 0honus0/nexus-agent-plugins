import { AGENT_SCOPE_MAX_NAME_BYTES } from '@nexus-terminal/shared/agent/scope/values';

/** Code-point truncation preserves the original persisted UTF-8 title capacity. */
export function normalizeTitle(value) {
	const normalized = value
		.replace(/[\uD800-\uDFFF]/gu, '')
		.replace(/[\u0000-\u001f\u007f]/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
	let title = '';
	for (const point of normalized) {
		if (Buffer.byteLength(title + point, 'utf8') > AGENT_SCOPE_MAX_NAME_BYTES) {
			break;
		}
		title += point;
	}
	return title.trim();
}

export function generatedTitle(value) {
	const first = value.split(/\r?\n/u).find((line) => line.trim()) ?? '';
	return normalizeTitle(first.trim().replace(/^["'`“”]+|["'`“”。.]+$/gu, ''));
}
