import { inject, watch, ref, shallowRef, type InjectionKey, type Ref, type ComputedRef } from 'vue';
import type { SessionInfo } from '../../shared/workspace-types';
import type { FileClipboard } from '../../shared/workspace-file-operation-types';

/** File intent is scoped to one Workspace window, never copied to the OS text clipboard. */
export function createWorkspaceFilesState(
	sessions: Ref<SessionInfo[]>,
	connections: ComputedRef<readonly { id: string; name: string; type: string }[]>,
	connect: (id: string) => void,
) {
	const clipboard = shallowRef<FileClipboard>();
	const revision = ref(0);
	watch(sessions, (items) => {
		if (clipboard.value && !items.some((s) => s.id === clipboard.value!.sourceSessionId))
			clipboard.value = undefined;
	});
	return {
		clipboard,
		revision,
		sessions,
		connections,
		connect,

		changed: () => {
			revision.value++;
		},

		copy(sourceSessionId: string, paths: string[], operation: 'copy' | 'cut') {
			clipboard.value = {
				generation: crypto.randomUUID(),
				sourceSessionId,
				paths: [...paths],
				operation,
			};
		},

		consumed(generation: string) {
			if (clipboard.value?.generation === generation && clipboard.value.operation === 'cut')
				clipboard.value = undefined;
		},
	};
}

export const workspaceFilesStateKey: InjectionKey<ReturnType<typeof createWorkspaceFilesState>> =
	Symbol('workspace-files');

export function useWorkspaceFilesState() {
	return inject(workspaceFilesStateKey)!;
}
