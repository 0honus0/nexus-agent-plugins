import Fuse from 'fuse.js';

/** Model matching is package owned; the Host catalog has already applied current authorization. */
export function searchDefinitions(available, query) {
	const normalized = query.trim();
	const candidates = available.filter((tool) => !tool.loader);
	if (normalized === '*') {
		return candidates;
	}
	const names = normalized.split(/[\s,，]+/u).filter(Boolean);
	if (names.length === 0) {
		return [];
	}
	if (names.every((word) => /^[a-z][a-z0-9]*_[a-z0-9_]+$/iu.test(word))) {
		const requested = new Set(names.map((word) => word.toLowerCase()));
		return candidates.filter(
			(tool) =>
				requested.has(tool.name.toLowerCase()) ||
				requested.has(tool.semanticName.toLowerCase()) ||
				tool.keywords.some((keyword) => requested.has(keyword.toLowerCase())),
		);
	}
	const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
	const words = [
		...new Set([...segmenter.segment(normalized)].filter((word) => word.isWordLike).map((word) => word.segment)),
	];
	if (words.length === 0) {
		return [];
	}
	const index = candidates.map((tool) => ({
		tool,
		name: tool.semanticName.replaceAll('_', ' '),
		description: tool.description,
		parameters: tool.parameters.join(' '),
		aliases: tool.keywords.join(' '),
	}));
	const keys = ['name', 'description', 'parameters', 'aliases'];
	const search = new Fuse(index, { keys, useExtendedSearch: true });
	return search
		.search({ $and: words.map((word) => ({ $or: keys.map((key) => ({ [key]: "'" + word })) })) })
		.map((match) => match.item.tool);
}
