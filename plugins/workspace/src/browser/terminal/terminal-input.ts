import { onScopeDispose } from 'vue';
import type { SessionTransport } from '../use-session-transport';
import { createStickyTerminalModifiers } from './terminal-sticky-modifiers';
import { applyTerminalModifiers } from './terminal-modifiers';
import { encodeTerminalKey, type TerminalKey } from './terminal-keys';

/** One input path for physical/system keyboards and the auxiliary keyboard, owned by this session. */
export function createTerminalInput(transport: SessionTransport) {
	const modifiers = createStickyTerminalModifiers();

	let cursorMode = () => false;

	const listeners = new Set<(data: string, predict: boolean) => void>();

	function send(data: string, predict = true) {
		if (!transport.connected.value || transport.terminalClosed.value) return;
		const modified = applyTerminalModifiers(data, modifiers.active.value);
		const value = modified ?? data;
		if (!transport.send({ type: 'input', data: value })) return;
		if (modified !== null) modifiers.consume();
		for (const listener of listeners) listener(value, predict);
	}

	onScopeDispose(() => {
		modifiers.clear();
		listeners.clear();
		cursorMode = () => false;
	});
	return {
		modifiers,
		send,

		command: (data: string) => {
			send(data.replace(/\r?\n/g, '\r') + '\r', false);
		},

		key: (key: TerminalKey) => send(encodeTerminalKey(key, { applicationCursorKeys: cursorMode() })),

		onSent(listener: (data: string, predict: boolean) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		bindCursorMode(reader: () => boolean) {
			cursorMode = reader;
			return () => {
				if (cursorMode === reader) cursorMode = () => false;
			};
		},
	};
}

export type TerminalInput = ReturnType<typeof createTerminalInput>;
