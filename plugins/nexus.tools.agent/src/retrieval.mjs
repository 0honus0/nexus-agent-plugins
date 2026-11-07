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

/** Relevance is package policy; published/expiry/source access and hard limits remain Host facts. */
export async function recallMemories(input, call, signal) {
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
					});
				}
			}
		},
	);
	ranked.sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.id.localeCompare(b.id));
	const references = [];
	let bytes = 2;
	for (const memory of ranked.slice(0, catalog.limits.maxItems)) {
		if (bytes + memory.bytes + 1 > catalog.limits.maxBytes) {
			break;
		}
		references.push({ id: memory.id, version: memory.version, score: memory.score });
		bytes += memory.bytes + 1;
	}
	const selected = await call({
		operation: 'memory.retrieve',
		action: 'select',
		limit: input.limit,
		candidatesSha256: catalog.snapshot,
		items: references,
	});
	if (selected.action !== 'select') {
		throw new Error('HOST_MEMORY_SELECTION_MISMATCH');
	}
	return {
		items: selected.items.map((memory) => ({
			id: memory.id,
			version: memory.version,
			content: memory.content,
			confidence: memory.confidence,
			score: memory.score,
		})),
		untrusted: true,
	};
}
