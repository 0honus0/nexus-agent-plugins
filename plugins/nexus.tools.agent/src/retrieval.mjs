import { agentPluginCapabilityReplyBytes } from '@nexus-terminal/shared/agent/plugins/runtime-codec';
import { AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES } from '@nexus-terminal/shared/agent/plugins/values';

/** Read one coherent, authorized Host candidate set without retaining a Host-side search session. */
async function candidates(operation, request, hashField, call, signal, consume) {
	const items = [];
	let offset = 0;
	let snapshot = null;
	let limits = null;
	for (;;) {
		signal.throwIfAborted();
		const page = await call({ operation, ...request, offset });
		const response = { operation, value: page };
		if (agentPluginCapabilityReplyBytes(response) > AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES) {
			throw new Error('HOST_CANDIDATE_PAGE_TOO_LARGE');
		}
		if (snapshot !== null && snapshot !== page[hashField]) {
			throw new Error('HOST_CANDIDATE_SNAPSHOT_CHANGED');
		}
		snapshot = page[hashField];
		if (operation === 'memory.retrieve') {
			if (page.action !== 'candidates') {
				throw new Error('HOST_MEMORY_CANDIDATES_MISMATCH');
			}
			if (limits !== null && (limits.maxItems !== page.maxItems || limits.maxBytes !== page.maxBytes)) {
				throw new Error('HOST_CANDIDATE_LIMITS_CHANGED');
			}
			limits = { maxItems: page.maxItems, maxBytes: page.maxBytes };
		}
		if (consume) {
			consume(page.items);
		} else {
			items.push(...page.items);
		}
		if (page.nextOffset === null) {
			return { items, limits, snapshot };
		}
		if (page.items.length === 0 || page.nextOffset !== offset + page.items.length) {
			throw new Error('HOST_CANDIDATE_CURSOR_INVALID');
		}
		offset = page.nextOffset;
	}
}

/** Score all requested Skill terms and apply the caller-selected result count. */
export async function searchSkills(input, call, signal) {
	const catalog = await candidates('skills.catalog', {}, 'catalogSha256', call, signal);
	const terms = [...new Set(input.query.toLocaleLowerCase('en-US').split(/\s+/u).filter(Boolean))];
	const matches = catalog.items
		.map((skill) => ({
			skill,
			score: terms.filter((term) =>
				(skill.name + ' ' + skill.description).toLocaleLowerCase('en-US').includes(term),
			).length,
		}))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
		.slice(0, input.limit)
		.map(({ skill }) => ({
			name: skill.name,
			description: skill.description,
			version: skill.version,
			sha256: skill.sha256,
		}));
	if (new Set(matches.map((skill) => skill.name)).size !== matches.length) {
		throw new Error('HOST_SKILL_MATCHES_AMBIGUOUS');
	}
	return { matches };
}

function selectionReplyBytes(items) {
	return agentPluginCapabilityReplyBytes({ operation: 'memory.retrieve', value: { action: 'select', items } });
}

/** Ranking and totals are instance policy; Host revalidates authorization and every selected version. */
export async function recallMemories(input, call, signal, configuration) {
	const terms = [...new Set(input.query.toLowerCase().split(/\s+/u).filter(Boolean))];
	const ranked = [];
	const catalog = await candidates(
		'memory.retrieve',
		{ action: 'candidates', limit: input.limit },
		'candidatesSha256',
		call,
		signal,
		(items) => {
			for (const memory of items) {
				const score = terms.reduce(
					(value, term) => value + (memory.content.toLowerCase().includes(term) ? 1 : 0),
					0,
				);
				if (score > 0) {
					const value = {
						id: memory.id,
						version: memory.version,
						content: memory.content,
						confidence: memory.confidence,
						score,
					};
					// Retain ranking metadata only; candidate bodies are released with each page.
					ranked.push({
						id: memory.id,
						version: memory.version,
						confidence: memory.confidence,
						score,
						bytes: Buffer.byteLength(JSON.stringify(value), 'utf8'),
						wireBytes: selectionReplyBytes([value]) - selectionReplyBytes([]),
					});
				}
			}
		},
	);
	ranked.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.id.localeCompare(b.id));
	const references = [];
	let bytes = 2;
	for (const memory of ranked.slice(0, Math.min(input.limit, configuration.maxRecallItems))) {
		const nextBytes = bytes + memory.bytes + (references.length ? 1 : 0);
		if (nextBytes > configuration.maxRecallBytes) {
			break;
		}
		references.push(memory);
		bytes = nextBytes;
	}
	// A transport frame is a page, never the total recall quota. Keep each revalidation within it.
	const batches = [];
	let batch = [];
	let wireBytes = selectionReplyBytes([]);
	for (const memory of references) {
		if (wireBytes + memory.wireBytes + (batch.length ? 1 : 0) > catalog.limits.maxBytes) {
			if (!batch.length) {
				throw new Error('HOST_MEMORY_SELECTION_TOO_LARGE');
			}
			batches.push(batch);
			batch = [];
			wireBytes = selectionReplyBytes([]);
		}
		if (wireBytes + memory.wireBytes > catalog.limits.maxBytes) {
			throw new Error('HOST_MEMORY_SELECTION_TOO_LARGE');
		}
		wireBytes += memory.wireBytes + (batch.length ? 1 : 0);
		batch.push({ id: memory.id, version: memory.version, score: memory.score });
	}
	if (batch.length || !batches.length) {
		batches.push(batch);
	}
	const items = [];
	for (const references of batches) {
		signal.throwIfAborted();
		const selected = await call({
			operation: 'memory.retrieve',
			action: 'select',
			limit: input.limit,
			candidatesSha256: catalog.snapshot,
			items: references,
		});
		signal.throwIfAborted();
		if (
			selected.action !== 'select' ||
			selected.items.length !== references.length ||
			selectionReplyBytes(selected.items) > catalog.limits.maxBytes ||
			selected.items.some(
				(memory, index) =>
					memory.id !== references[index].id ||
					memory.version !== references[index].version ||
					memory.score !== references[index].score,
			)
		) {
			throw new Error('HOST_MEMORY_SELECTION_MISMATCH');
		}
		for (const memory of selected.items) {
			items.push({
				id: memory.id,
				version: memory.version,
				content: memory.content,
				confidence: memory.confidence,
				score: memory.score,
			});
		}
	}
	return { items, untrusted: true };
}
