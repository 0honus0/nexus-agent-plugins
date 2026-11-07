import { readAgentRunStreamEvent } from '@nexus-terminal/shared/agent/runs/events';
import type { AgentRunStreamCursor } from '@nexus-terminal/shared/agent/runs/events';
import type { NativeThreadScope } from '@/features/agent/model/native-thread-types';
import type {
	NativeRunSubscription,
	NativeRunStreamCursor,
	NativeRunUpdate,
} from '@/features/agent/model/native-run-types';
import { fromNativeRunUpdate } from '@/features/agent/model/native-run-mapper';
import { AgentManagementFailure } from '@/features/agent/model/management-failure';
import { subscribeAgentPageStream } from '@/platform/client';

/** Run projection on the page's authenticated transport; state is applied before granting more credit. */
export function subscribeNativeRun(
	scope: NativeThreadScope,
	runId: string,
	getCursor: () => NativeRunStreamCursor,
	onUpdate: (update: NativeRunUpdate) => boolean,
	onRejected: (cause: AgentManagementFailure) => void,
): NativeRunSubscription {
	let cursor: AgentRunStreamCursor | null = null;
	let first = true;
	return subscribeAgentPageStream({
		source() {
			const initial = getCursor();
			cursor = {
				threadId: initial.threadId,
				events: initial.events,
				approvals: null,
				entries: {
					runSequence: initial.entries.runSequence,
					messageOrdinal: initial.entries.messageOrdinal,
					chunkIndex: initial.entries.chunkIndex,
					textOffset: initial.entries.textOffset,
				},
			};
			first = true;
			return {
				kind: 'run',
				runId,
				cursor,
			};
		},

		apply(input, revision) {
			if (!cursor) throw new Error('Missing Agent cursor');
			const event = readAgentRunStreamEvent(
				input,
				{ appId: scope.appId, appVersion: scope.appVersion, runId },
				cursor,
			);
			if (
				event.type !== 'update' ||
				event.revision !== revision ||
				(first && event.state === null) ||
				(event.state && event.state.run.version < getCursor().runVersion)
			)
				throw new Error('Invalid Agent update');
			if (!onUpdate(fromNativeRunUpdate(event))) return false;
			cursor = {
				threadId: cursor.threadId,
				entries: {
					runSequence: event.body.nextCursor.runSequence,
					messageOrdinal: event.body.nextCursor.messageOrdinal,
					chunkIndex: event.body.nextCursor.chunkIndex,
					textOffset: event.body.nextCursor.textOffset,
				},
				events: event.state?.events.nextCursor ?? cursor.events,
				approvals: event.state
					? event.state.approvals.hasMore
						? event.state.approvals.nextCursor
						: null
					: cursor.approvals,
			};
			first = false;
			return true;
		},

		rejected(code) {
			onRejected(
				new AgentManagementFailure(code === 'forbidden' ? 'forbidden' : 'protocol_failure', 'not_dispatched'),
			);
		},
	});
}
