import { onScopeDispose, shallowRef, ref, watch } from 'vue';
import { useDocumentVisibility } from '@vueuse/core';
import type { PluginContextApi } from 'nexus-terminal/browser';
import type { ErrorDetail } from '../../shared/workspace-diagnostic-types.js';
import { emptyStatusHistory, appendStatusHistory } from './status-history';
import { StatusEventSchema, type ServerStatus } from '../../shared/workspace-status-types';

export function useServerStatus(props: { ctx: PluginContextApi; sessionId: string; enabled: boolean }) {
	const current = shallowRef<ServerStatus>();
	const history = shallowRef(emptyStatusHistory());
	const error = shallowRef<ErrorDetail>();
	let sequence = 0;
	const available = ref(false);
	const visibility = useDocumentVisibility();
	let stream: ReturnType<typeof props.ctx.app.ws.connect> | undefined;
	let generation = 0;

	function stop() {
		generation++;
		sequence++;
		stream?.close();
		stream = undefined;
		available.value = false;
	}

	watch(
		() => [props.sessionId, props.enabled && visibility.value === 'visible'] as const,
		([, active]) => {
			stop();
			if (!active) return;
			const token = generation;
			stream = props.ctx.app.ws.connect('/status?sessionId=' + encodeURIComponent(props.sessionId), {
				autoReconnect: { retries: 5, delay: 1500 },

				onDisconnected() {
					if (token === generation) {
						available.value = false;
						sequence++;
					}
				},

				onMessage(_socket, event) {
					if (token !== generation) return;
					let parsed;
					try {
						parsed = StatusEventSchema.safeParse(JSON.parse(event.data));
					} catch {
						return;
					}
					if (!parsed.success) return;
					const message = parsed.data;
					if (message.type === 'error') {
						sequence++;
						error.value = message.error;
						available.value = false;
						return;
					}
					available.value = true;
					current.value = message.sample;
					error.value = undefined;
					history.value = appendStatusHistory(history.value, message.sample, ++sequence);
				},
			});
		},
		{ immediate: true },
	);
	onScopeDispose(stop);
	return { current, history, available, error };
}
