import { AgentManagementFailure } from '@/features/agent/model/management-failure';
import type {
	NativeEntryCursor,
	NativeApproval,
	NativeRun,
	NativeChild,
	NativeEntry,
	NativeConversationEntry,
	NativeTool,
	NativeConversationSnapshot,
} from '@/features/agent/model/native-run-types';

export const NATIVE_CONVERSATION_MAX_ENTRIES = 128;

export const NATIVE_CONVERSATION_MAX_CHARACTERS = 256 * 1024;

/** Reclaim complete messages outside the visible window; the server retains every fragment.
 * Index zero may be a partial history page, so only a later message can become the new boundary.
 */
export function releaseNativeConversationHistory(
	entries: NativeConversationEntry[],
	firstVisible: number,
): NativeEntryCursor | null {
	let start = entries.length;
	let characters = 0;
	while (start > 0) {
		const entry = entries[start - 1];
		if (!entry) break;
		if (
			start < entries.length &&
			(entries.length - start >= NATIVE_CONVERSATION_MAX_ENTRIES ||
				characters + entry.text.length > NATIVE_CONVERSATION_MAX_CHARACTERS)
		)
			break;
		characters += entry.text.length;
		start--;
	}
	start = Math.min(start, Math.max(0, firstVisible));
	const first = entries[start];
	if (start === 0 || !first) return null;
	entries.splice(0, start);
	return {
		runSequence: first.position.runSequence,
		messageOrdinal: first.position.messageOrdinal,
		chunkIndex: first.position.chunkIndex,
		textOffset: 0,
	};
}

/** Preserve the separately paged history anchor while accepting forward stream data. */
export function appendNativeConversationWindow(
	current: NativeConversationSnapshot,
	page: { items: NativeEntry[]; nextCursor: NativeEntryCursor },
): NativeConversationSnapshot {
	validateNativeConversationPage(current.cursor, page.items);
	const combined = appendNativeConversationEntries(current.entries, page.items);
	return {
		entries: combined,
		cursor: page.nextCursor,
		startCursor: current.startCursor,
		olderHidden: current.olderHidden,
	};
}

export function validateNativeConversationPage(cursor: NativeEntryCursor, items: readonly NativeEntry[]): void {
	let previous = cursor;
	for (const item of items) {
		if (compareNativeEntryCursor(previous, item.position) >= 0) {
			throw new AgentManagementFailure('protocol_failure', 'unknown');
		}
		previous = item.position;
	}
}

export function isNativeRunActive(run: NativeRun | NativeChild): boolean {
	return run.status === 'pending' || run.status === 'running' || run.status === 'suspended';
}

/** An unconfirmed effect has stopped execution but still requires explicit closure. */
export function canCancelNativeRun(run: NativeRun | NativeChild): boolean {
	return isNativeRunActive(run) || run.status === 'unknown';
}

export function compareNativeEntryCursor(left: NativeEntryCursor, right: NativeEntryCursor): number {
	return (
		left.runSequence - right.runSequence ||
		left.messageOrdinal - right.messageOrdinal ||
		left.chunkIndex - right.chunkIndex ||
		left.textOffset - right.textOffset
	);
}

export function nativeModelKey(model: { providerId: string; modelId: string; configurationVersion: number }): string {
	return JSON.stringify([model.providerId, model.modelId, model.configurationVersion]);
}

/** Merge presentation only; never derive the transport continuation from the display anchor. */
export function appendNativeConversationEntries(
	current: NativeConversationEntry[],
	incoming: readonly NativeEntry[],
): NativeConversationEntry[] {
	if (incoming.length === 0) {
		return current;
	}
	const combined = current.slice();
	const last = combined.at(-1);
	if (last) {
		combined[combined.length - 1] = {
			runId: last.runId,
			operationSequence: last.operationSequence,
			role: last.role,
			position: last.position,
			text: last.text,
		};
	}
	applyNativeConversationEntries(combined, incoming);
	return combined;
}

/** Live updates preserve message identity so text does not invalidate all transcript indexes. */
export function applyNativeConversationEntries(
	current: NativeConversationEntry[],
	incoming: readonly NativeEntry[],
): void {
	for (const item of incoming) {
		const previous = current.at(-1);
		if (previous && continuesNativeMessage(previous, item)) {
			previous.text += item.text;
		} else {
			current.push({
				runId: item.runId,
				operationSequence: item.operationSequence,
				role: item.role,
				position: {
					runSequence: item.position.runSequence,
					messageOrdinal: item.position.messageOrdinal,
					chunkIndex: item.position.chunkIndex,
					textOffset: item.position.textOffset,
				},
				text: item.text,
			});
		}
	}
}

function continuesNativeMessage(previous: NativeEntry, next: NativeEntry): boolean {
	return (
		previous.runId === next.runId &&
		previous.role === next.role &&
		previous.position.runSequence === next.position.runSequence &&
		previous.position.messageOrdinal === next.position.messageOrdinal &&
		(next.role === 'assistant' || previous.position.chunkIndex === next.position.chunkIndex)
	);
}

/** Prepending one page only replaces its shared boundary message, preserving visible rows and images. */
export function prependNativeConversationEntries(
	current: NativeConversationEntry[],
	incoming: readonly NativeEntry[],
): NativeConversationEntry[] {
	if (incoming.length === 0) return current;
	const prefix = appendNativeConversationEntries([], incoming);
	const last = prefix.at(-1);
	const first = current[0];
	if (last && first && continuesNativeMessage(last, first)) {
		last.text += first.text;
		return prefix.concat(current.slice(1));
	}
	return prefix.concat(current);
}

export function mergeNativeTools(current: NativeTool[], incoming: readonly NativeTool[]): NativeTool[] {
	if (incoming.length === 0) {
		return current;
	}
	const items = new Map(current.map((item) => [item.id, item]));
	let changed = false;
	for (const item of incoming) {
		const old = items.get(item.id);
		if (!old || old.revision < item.revision) {
			items.set(item.id, item);
			changed = true;
		}
	}
	if (!changed) {
		return current;
	}
	return [...items.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function mergeNativeApprovals(current: NativeApproval[], incoming: readonly NativeApproval[]): NativeApproval[] {
	if (incoming.length === 0) {
		return current;
	}
	const items = new Map(current.map((item) => [item.id, item]));
	let changed = false;
	for (const item of incoming) {
		const old = items.get(item.id);
		if (!old || old.version < item.version) {
			items.set(item.id, item);
			changed = true;
		}
	}
	if (!changed) {
		return current;
	}
	return [...items.values()].sort((a, b) => a.requestedAt - b.requestedAt || a.id.localeCompare(b.id));
}
