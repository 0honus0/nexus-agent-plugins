import { shallowRef } from 'vue';
import type { AgentPluginFrontendSdk } from '@nexus-terminal/shared/agent/plugins/frontend-sdk';
import type { AgentPluginUiStreamConsumer } from '@nexus-terminal/shared/agent/plugins/ui-streams';
import type { AgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
import { toChatSdkFailure } from './sdk-failure';

/** The public SDK owns transport, page credit, reconnects and environment delivery. */
export function createPlatform(sdk: AgentPluginFrontendSdk): AgentChatUiPlatform {
	const current = sdk.ui.environment;
	if (!current) throw new Error('Missing Host environment');
	const environment = shallowRef(current);
	const closed = shallowRef(false);
	const stopEnvironment = sdk.ui.onEnvironment((value) => {
		environment.value = value;
	});
	const stopClose = sdk.ui.onClose(() => {
		closed.value = true;
		stopEnvironment();
	});
	return {
		sdk,
		environment,
		closed,
		async request(input, signal, file) {
			try {
				return await sdk.ui.request(input, signal, file);
			} catch (cause) {
				throw toChatSdkFailure(cause);
			}
		},
		onTaskOpen: (listener) => sdk.ui.onTaskOpen(listener),
		dispose() {
			closed.value = true;
			stopEnvironment();
			stopClose();
		},
	};
}

export function subscribeAgentPageStream(consumer: AgentPluginUiStreamConsumer) {
	return useAgentChatUiPlatform().sdk.ui.streams.subscribe(consumer);
}
