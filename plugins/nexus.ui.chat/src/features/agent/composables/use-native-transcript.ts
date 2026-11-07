import { computed, type Ref } from 'vue';
import type { NativeConversationEntry, NativeTool, NativeTranscriptRow } from '@/features/agent/model/native-run-types';

/** Associate cards with real operation/message order; an App need not have model steps. */
export function useNativeTranscript(entries: Ref<NativeConversationEntry[]>, tools: Ref<NativeTool[]>) {
	const messageId = (entry: NativeConversationEntry) =>
		[
			entry.runId,
			entry.role,
			entry.position.messageOrdinal,
			entry.role === 'user' ? entry.position.chunkIndex : 0,
		].join(':');
	let anchors = new Map<string, string>();
	let previousRows = new Map<string, NativeTranscriptRow>();

	const transcriptRows = computed<NativeTranscriptRow[]>(() => {
		const indexes = new Map(entries.value.map((entry, index) => [messageId(entry), index]));
		const assigned = new Map<number, NativeTool[]>();
		const orphan = new Map<string, NativeTool[]>();
		const nextAnchors = new Map<string, string>();
		for (const tool of [...tools.value].sort((left, right) => left.sequence - right.sequence)) {
			const original = anchors.get(tool.id);
			if (original !== undefined && !indexes.has(original)) {
				// A reclaimed history page keeps ownership of its cards until it is read again.
				nextAnchors.set(tool.id, original);
				continue;
			}
			let target: number | undefined;
			let preceding = -1;
			for (let index = 0; index < entries.value.length; index++) {
				const entry = entries.value[index];
				if (!entry || entry.runId !== tool.runId || entry.operationSequence > tool.sequence) {
					continue;
				}
				if (entry.operationSequence >= preceding) {
					preceding = entry.operationSequence;
					target = index;
				}
			}
			if (target === undefined) {
				const group = orphan.get(tool.runId) ?? [];
				group.push(tool);
				orphan.set(tool.runId, group);
				continue;
			}
			const entry = entries.value[target];
			if (entry) {
				nextAnchors.set(tool.id, messageId(entry));
			}
			const group = assigned.get(target) ?? [];
			group.push(tool);
			assigned.set(target, group);
		}
		anchors = nextAnchors;
		const rows: NativeTranscriptRow[] = entries.value.map((entry, index) => ({
			id: messageId(entry),
			entry,
			entryIndex: index,
			tools: assigned.get(index) ?? [],
		}));
		for (const [runId, group] of orphan) {
			rows.push({ id: 'tools:' + runId, entry: null, entryIndex: -1, tools: group });
		}
		const next = new Map<string, NativeTranscriptRow>();
		const result = rows.map((row) => {
			const previous = previousRows.get(row.id);
			const stable =
				previous &&
				previous.entry === row.entry &&
				previous.entryIndex === row.entryIndex &&
				previous.tools.length === row.tools.length &&
				previous.tools.every((tool, index) => tool === row.tools[index])
					? previous
					: row;
			next.set(row.id, stable);
			return stable;
		});
		previousRows = next;
		return result;
	});
	return { transcriptRows };
}
