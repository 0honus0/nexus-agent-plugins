import { TOOL_RESULT_MAX_BYTES } from '../../../lib/model-tools/limits.mjs';
import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

/** The model sees twenty models at a time; Host returns the currently authorized catalog. */
export function imageModelPage(models, offset) {
	return {
		models: models.slice(offset, offset + 20),
		nextOffset: offset + 20 < models.length ? offset + 20 : null,
	};
}

/** Budget the complete JSON envelope, including commas and a resumable nextIndex. */
async function collectPages(values, read, signal) {
	const items = [];
	let bytes = 0;
	for (const [index, value] of values.entries()) {
		signal.throwIfAborted();
		const item = await read(value, index);
		const size = Buffer.byteLength(JSON.stringify(item)) + (items.length === 0 ? 0 : 1);
		const nextIndex = index + 1 < values.length ? index + 1 : null;
		const envelopeBytes = Buffer.byteLength(JSON.stringify({ items: [], nextIndex }));
		if (envelopeBytes + bytes + size > TOOL_RESULT_MAX_BYTES) {
			if (items.length === 0) {
				throw new AgentFailure('limit_exceeded');
			}
			break;
		}
		items.push(item);
		bytes += size;
	}
	return { items, nextIndex: items.length < values.length ? items.length : null };
}

export function presentArtifacts(artifactIds, call, signal) {
	return collectPages(
		artifactIds,
		async (artifactId, index) => {
			const saved = await call({ operation: 'artifacts.present', artifactId });
			return {
				index,
				status: 'completed',
				value: { id: saved.id, name: saved.name, sizeBytes: saved.sizeBytes },
			};
		},
		signal,
	);
}

export function readToolResults(requests, call, signal) {
	return collectPages(
		requests,
		async (request, index) => {
			const page = await call({
				operation: 'context.readResults',
				item: {
					toolCallId: request.toolCallId,
					sha256: request.sha256,
					offset: request.offset,
					maxBytes: request.maxBytes,
				},
			});
			return {
				index,
				toolCallId: page.toolCallId,
				sha256: page.sha256,
				originalBytes: page.originalBytes,
				offset: page.offset,
				nextOffset: page.nextOffset,
				text: page.text,
			};
		},
		signal,
	);
}
