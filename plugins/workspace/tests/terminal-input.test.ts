import { expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { createTerminalInput } from '../src/browser/terminal/terminal-input';
import { encodeTerminalKey } from '../src/browser/terminal/terminal-keys';
import { presentationProfiles } from '../src/browser/presentation/presentation-defaults';
import type { SessionTransport } from '../src/browser/use-session-transport';
it('shares input modifiers, follows cursor mode and never sends after disconnection', () => {
	const send = vi.fn(() => true),
		connected = ref(true),
		scope = effectScope();
	const input = scope.run(() =>
		createTerminalInput({
			send,
			connected,
			terminalClosed: ref(false),
		} as unknown as SessionTransport),
	)!;
	input.modifiers.toggle('ctrl', 100);
	input.send('c');
	expect(send).toHaveBeenLastCalledWith({ type: 'input', data: '\x03' });
	expect(input.modifiers.levels.ctrl).toBe('off');
	input.bindCursorMode(() => true);
	input.key('arrowUp');
	expect(send).toHaveBeenLastCalledWith({ type: 'input', data: '\x1bOA' });
	input.modifiers.toggle('alt', 100);
	input.modifiers.toggle('alt', 200);
	input.send('x');
	input.send('y');
	expect(send).toHaveBeenLastCalledWith({ type: 'input', data: '\x1by' });
	connected.value = false;
	const calls = send.mock.calls.length;
	input.key('f1');
	expect(send).toHaveBeenCalledTimes(calls);
	scope.stop();
	expect(input.modifiers.levels.alt).toBe('off');
});
it('keeps narrow tools out of the initial regions without removing their entry points', () => {
	expect(presentationProfiles.compact.initialRegions).toEqual(['terminal']);
	expect(presentationProfiles.compact.tools.files).toEqual({
		presentation: 'sheet',
		defaultOpen: false,
	});
	expect(presentationProfiles.compact.navigation.items).toContain('files');
	expect(presentationProfiles.medium.tools).not.toHaveProperty('keyboard');
	expect(presentationProfiles.wide.navigation.placement).toBe('side');
	expect(presentationProfiles.medium.regions).toEqual(presentationProfiles.wide.regions);
	expect(encodeTerminalKey('f12', { applicationCursorKeys: false })).toBe('\x1b[24~');
});

it('notifies prediction only for accepted input and marks commands as non-predictable', () => {
	const scope = effectScope(),
		sent = vi.fn(),
		send = vi.fn(() => true);
	const input = scope.run(() =>
		createTerminalInput({ send, connected: ref(true), terminalClosed: ref(false) } as unknown as SessionTransport),
	)!;
	const unsubscribe = input.onSent(sent);
	input.send('中文');
	expect(sent).toHaveBeenLastCalledWith('中文', true);
	input.command('ls');
	expect(sent).toHaveBeenLastCalledWith('ls\r', false);
	send.mockReturnValueOnce(false);
	input.send('not-sent');
	expect(sent).toHaveBeenCalledTimes(2);
	unsubscribe();
	input.send('not-observed');
	expect(sent).toHaveBeenCalledTimes(2);
	scope.stop();
});
