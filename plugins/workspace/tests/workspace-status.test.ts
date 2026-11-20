import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { RemoteToolsSessionApi } from '@nexus-terminal/remote-tools/remote-tools-api';
import { createWorkspaceStatus } from '../src/node/workspace-status';
afterEach(() => vi.useRealTimers());

function socket() {
	const value = Object.assign(new EventEmitter(), {
		readyState: 1,
		bufferedAmount: 0,
		send: vi.fn(),
		close: vi.fn(),
	});
	value.close.mockImplementation(() => {
		value.readyState = 3;
		value.emit('close');
	});
	return value as unknown as WebSocket;
}

it('cancels the remote tools operation and stops scheduling when the panel disconnects', async () => {
	vi.useFakeTimers();
	let canceled = false;
	const getStatus = vi.fn(
		({ signal }: { signal: AbortSignal }) =>
			new Promise<never>((_resolve, reject) => {
				signal.addEventListener(
					'abort',
					() => {
						canceled = true;
						reject(new Error('aborted'));
					},
					{ once: true },
				);
			}),
	);
	const tools = { getStatus, resetStatus: vi.fn() } as unknown as RemoteToolsSessionApi;
	const monitor = createWorkspaceStatus(tools, { report: vi.fn() });
	const client = socket();
	monitor.attach(client);
	await vi.advanceTimersByTimeAsync(0);
	client.emit('close');
	await vi.advanceTimersByTimeAsync(20000);
	expect(canceled).toBe(true);
	expect(getStatus).toHaveBeenCalledOnce();
	await monitor.dispose();
	expect(vi.getTimerCount()).toBe(0);
});
it('pushes samples, rejects concurrent subscribers and reports repeated failures once', async () => {
	vi.useFakeTimers();
	const getStatus = vi
		.fn()
		.mockResolvedValueOnce({ timestamp: 1000, memPercent: 25 })
		.mockRejectedValue(Object.assign(new Error('safe code'), { code: 'REMOTE_TOOLS_EXEC_TIMEOUT' }));
	const tools = { getStatus, resetStatus: vi.fn() } as unknown as RemoteToolsSessionApi;
	const report = vi.fn();
	const monitor = createWorkspaceStatus(tools, { report });
	const client = socket();
	monitor.attach(client);
	expect(() => monitor.attach(socket())).toThrow('WORKSPACE_ALREADY_ATTACHED');
	await vi.advanceTimersByTimeAsync(0);
	expect(client.send).toHaveBeenCalledWith(expect.stringContaining('"memPercent":25'));
	await vi.advanceTimersByTimeAsync(6001);
	expect(report).toHaveBeenCalledOnce();
	expect(report.mock.calls[0]?.[0].code).toBe('REMOTE_TOOLS_EXEC_TIMEOUT');
	await monitor.dispose();
	expect(vi.getTimerCount()).toBe(0);
});
