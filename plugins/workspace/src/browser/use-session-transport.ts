import { onScopeDispose, ref } from 'vue';
import type { z } from 'zod';
import type { PluginContextApi } from 'nexus-terminal/browser';
import { TerminalControlSchema } from '../shared/workspace-types';
type Output = z.infer<typeof TerminalControlSchema> | { type: 'output'; data: Uint8Array };

/** The connection tab owns its attachment. Switching terminal/files never detaches SSH. */
export function useSessionTransport(ctx: PluginContextApi, id: string, signal: AbortSignal) {
	const connected = ref(false),
		terminalClosed = ref(false);
	const listeners = new Set<(message: Output) => void>();
	let stream: ReturnType<typeof ctx.app.ws.connect> | undefined;

	const close = () => stream?.close();

	function connect() {
		if (signal.aborted || stream) return;
		stream = ctx.app.ws.connect('/terminal?sessionId=' + encodeURIComponent(id), {
			signal,
			autoReconnect: { retries: 5, delay: 1000 },

			onConnected(socket) {
				socket.binaryType = 'arraybuffer';
			},

			onDisconnected() {
				connected.value = false;
			},

			onMessage(_socket, event) {
				let message: Output;
				try {
					message =
						event.data instanceof ArrayBuffer
							? { type: 'output', data: new Uint8Array(event.data) }
							: TerminalControlSchema.parse(JSON.parse(event.data));
				} catch {
					return;
				}
				if (message.type === 'snapshot') {
					connected.value = true;
					terminalClosed.value = message.closed;
				}
				if (message.type === 'closed') terminalClosed.value = true;
				for (const listener of listeners) listener(message);
			},
		});
	}

	onScopeDispose(() => {
		close();
		listeners.clear();
	});
	return {
		connected,
		terminalClosed,

		send(message: unknown) {
			if (signal.aborted || !connected.value || terminalClosed.value) return false;
			return stream?.send(JSON.stringify(message), false) ?? false;
		},

		subscribe(listener: (message: Output) => void) {
			listeners.add(listener);
			// Attach only after the terminal consumer is listening: dock anchors mount asynchronously.
			connect();
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export type SessionTransport = ReturnType<typeof useSessionTransport>;
