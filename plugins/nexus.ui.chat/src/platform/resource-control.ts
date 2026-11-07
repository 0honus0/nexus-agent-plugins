import { ref } from 'vue';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
import type { NativeThreadScope } from '@/features/agent/model/native-thread-types';
import type { NativeResourceCloseTarget } from '@/features/agent/model/native-resource-types';

export function useAgentResourceControl(available: () => boolean) {
	const platform = useAgentChatUiPlatform();
	const busy = ref(false);
	const uncertain = ref(false);

	async function close(scope: NativeThreadScope, target: NativeResourceCloseTarget): Promise<boolean> {
		if (busy.value || !available() || scope.appId !== platform.environment.value.appId) return false;
		busy.value = true;
		try {
			const result = await platform.request({ kind: 'resources.close', target });
			return result.kind === 'resources.close' && result.closed;
		} catch {
			uncertain.value = true;
			return false;
		} finally {
			busy.value = false;
		}
	}

	return { busy, uncertain, close };
}
