/** Deliberately approximate; these values are neither measured usage nor a tokenizer. */
export function estimateTokens(text) {
	return Math.ceil(text.length / 4);
}

export function estimateMessages(messages) {
	return messages.reduce((total, message) => total + estimateTokens(JSON.stringify(message)) + 4, 0);
}

export function compactionCeiling(window, mode = 'balanced') {
	if (window === null) {
		return Infinity;
	}
	return (
		window -
		Math.max(
			Math.floor(window * (mode === 'aggressive' ? 0.25 : mode === 'conservative' ? 0.1 : 0.15)),
			window >= 32000 ? 16000 : 0,
		)
	);
}

/** Compact only complete message groups, preserving tool call/result pairs. */
export function compactionCut(groups, window, mode = 'balanced') {
	const keep = Math.min(
		Math.max(30000, Math.floor(window * (mode === 'aggressive' ? 0.15 : mode === 'conservative' ? 0.4 : 0.25))),
		Math.floor(window * 0.5),
	);
	let tokens = 0;
	let boundary = groups.length;
	for (let index = groups.length - 1; index >= 0; index--) {
		tokens += groups[index].estimatedTokens;
		boundary = index;
		if (tokens >= keep) {
			break;
		}
	}
	return boundary > 0 && boundary < groups.length ? boundary : null;
}

export function usefulSummary(summary, sourceTokens) {
	return summary.trim().length > 0 && estimateMessages([{ role: 'user', content: summary }]) < sourceTokens;
}
