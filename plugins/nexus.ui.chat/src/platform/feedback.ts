import { onActivated, onDeactivated, watch } from 'vue';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
import type { AgentPluginUiHostInput } from '@nexus-terminal/shared/agent/plugins/ui-events';

export function useFeedback() {
	const platform = useAgentChatUiPlatform();

	function notify(tone: 'success' | 'error' | 'info' | 'warning', message: string, duration?: number): void {
		void platform
			.request({ kind: 'feedback.notify', tone, message, duration: duration ?? null })
			.catch(() => undefined);
	}

	return {
		notifySuccess: (message: string, duration?: number) => notify('success', message, duration),

		notifyError: (message: string, duration?: number) => notify('error', message, duration),

		notifyInfo: (message: string, duration?: number) => notify('info', message, duration),

		notifyWarning: (message: string, duration?: number) => notify('warning', message, duration),

		async confirm(input: {
			title: string;
			message: string;
			confirmText?: string;
			cancelText?: string;
			destructive?: boolean;
			signal?: AbortSignal;
		}): Promise<boolean> {
			const request: AgentPluginUiHostInput = {
				kind: 'feedback.confirm',
				title: input.title,
				message: input.message,
				confirmText: input.confirmText ?? '',
				cancelText: input.cancelText ?? '',
				destructive: input.destructive ?? false,
			};
			const result = await platform.request(request, input.signal);
			return result.kind === 'feedback.confirm' && result.confirmed;
		},
	};
}

export function useFeedbackMessage(
	message: () => string,
	kind: () => 'success' | 'error' | 'info' | 'warning' = () => 'error',
	_cause?: () => unknown,
	_action?: () => unknown,
): void {
	const feedback = useFeedback();
	let active = true;
	watch(
		[message, kind],
		([value, tone]) => {
			if (active && value) {
				if (tone === 'success') feedback.notifySuccess(value);
				else if (tone === 'warning') feedback.notifyWarning(value);
				else if (tone === 'info') feedback.notifyInfo(value);
				else feedback.notifyError(value);
			}
		},
		{ immediate: true },
	);
	onActivated(() => {
		active = true;
	});
	onDeactivated(() => {
		active = false;
	});
}
