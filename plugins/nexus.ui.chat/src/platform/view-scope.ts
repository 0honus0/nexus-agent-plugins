import { onActivated, onBeforeUnmount, onDeactivated, watch } from 'vue';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';

export type ViewRevocation = 'session' | 'view' | 'disposed';

/** This scope tracks a single opaque Host grant; it contains no authentication identity. */
export function useAuthenticatedViewScope(
	options: { available?: () => boolean; retainOnView?: boolean; onRevoke?: (reason: ViewRevocation) => void } = {},
) {
	const platform = useAgentChatUiPlatform();
	let controller = new AbortController();
	let active = true;
	let disposed = false;
	const available = options.available ?? (() => true);

	function revoke(reason: ViewRevocation): void {
		controller.abort();
		options.onRevoke?.(reason);
	}

	function activate(): void {
		if (!disposed && active && !platform.closed.value && available() && controller.signal.aborted)
			controller = new AbortController();
	}

	watch(
		() => platform.closed.value,
		(closed) => {
			if (closed) revoke('session');
		},
		{ flush: 'sync' },
	);
	watch(
		available,
		(value) => {
			if (value) activate();
			else if (!options.retainOnView) revoke('view');
		},
		{ immediate: true, flush: 'sync' },
	);
	onActivated(() => {
		active = true;
		activate();
	});
	onDeactivated(() => {
		active = false;
		revoke('view');
	});
	onBeforeUnmount(() => {
		disposed = true;
		revoke('disposed');
	});
	return {
		capture: () => controller.signal,

		isCurrent: (signal: AbortSignal) =>
			!disposed &&
			active &&
			!platform.closed.value &&
			(available() || options.retainOnView === true) &&
			signal === controller.signal &&
			!signal.aborted,
	};
}
