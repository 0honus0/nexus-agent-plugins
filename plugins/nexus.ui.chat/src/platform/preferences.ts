import { computed } from 'vue';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';

export function usePreferences() {
	const platform = useAgentChatUiPlatform();
	return { values: computed(() => ({ imagePreviewMaxMiB: platform.environment.value.imagePreviewMaxMiB })) };
}
