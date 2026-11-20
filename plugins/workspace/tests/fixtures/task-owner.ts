import { vi } from 'vitest';
import type { PluginContextApi } from 'nexus-terminal/browser';
type AppTaskWork<T> = (signal: AbortSignal) => T | Promise<T>;

/** Host runner semantics are tested in the host. Plugin tests control I/O timing. */
export function taskOwner() {
	const controller = new AbortController();
	const tasks = {
		run: <T>(work: AppTaskWork<T>) =>
			Promise.resolve().then(async () => {
				controller.signal.throwIfAborted();
				const value = await work(controller.signal);
				controller.signal.throwIfAborted();
				return value;
			}),

		background: (_name: string, work: AppTaskWork<unknown>) => {
			void Promise.resolve().then(() => work(controller.signal));
		},
	};
	const ctx = { signal: controller.signal, onDispose: vi.fn(), app: { tasks } } as unknown as PluginContextApi;
	return { ctx, controller };
}
