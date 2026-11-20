import { afterEach, expect, it, vi } from 'vitest';
import type { ClientChannel } from 'ssh2';
import type { WebSocket } from 'ws';
import { createTerminalBackpressure } from '../src/node/terminal-backpressure';

afterEach(() => vi.useRealTimers());

it('uses high/low hysteresis and keeps parser pressure independent from network pressure', () => {
	vi.useFakeTimers();
	const channel = { pause: vi.fn(), resume: vi.fn() };
	const socket = { readyState: 1, bufferedAmount: 0 };
	const flow = createTerminalBackpressure(channel as unknown as ClientChannel, () => socket as WebSocket);
	flow.parsing(true);
	expect(channel.pause).toHaveBeenCalledOnce();
	socket.bufferedAmount = 8 * 1024 * 1024;
	flow.parsing(false);
	expect(channel.resume).not.toHaveBeenCalled();
	socket.bufferedAmount = 2 * 1024 * 1024;
	vi.advanceTimersByTime(50);
	expect(channel.resume).not.toHaveBeenCalled();
	flow.parsing(true);
	socket.bufferedAmount = 1024 * 1024;
	vi.advanceTimersByTime(50);
	expect(channel.resume).not.toHaveBeenCalled();
	flow.parsing(false);
	expect(channel.resume).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
	flow.dispose();
});

it('releases congestion on detach/suspend and clears timers on disposal', () => {
	vi.useFakeTimers();
	const channel = { pause: vi.fn(), resume: vi.fn() };
	let socket = { readyState: 1, bufferedAmount: 9 * 1024 * 1024 } as WebSocket | undefined;
	const flow = createTerminalBackpressure(channel as unknown as ClientChannel, () => socket);
	flow.check();
	expect(vi.getTimerCount()).toBe(1);
	socket = undefined;
	flow.check();
	expect(channel.resume).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
	socket = { readyState: 1, bufferedAmount: 9 * 1024 * 1024 } as WebSocket;
	flow.check();
	flow.dispose();
	flow.parsing(false);
	vi.advanceTimersByTime(500);
	expect(vi.getTimerCount()).toBe(0);
	expect(channel.resume).toHaveBeenCalledOnce();
});
