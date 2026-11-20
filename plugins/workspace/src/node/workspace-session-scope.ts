import type { PluginScopeApi } from 'nexus-terminal/node';

export class WorkspaceSessionScope implements PluginScopeApi {
	readonly #controller = new AbortController();
	readonly #resources = new Set<() => void | Promise<void>>();
	#closing?: Promise<void>;
	readonly signal = this.#controller.signal;

	onDispose(cleanup: () => void | Promise<void>): () => void {
		this.signal.throwIfAborted();
		this.#resources.add(cleanup);
		return () => this.#resources.delete(cleanup);
	}

	close(): Promise<void> {
		return (this.#closing ??= Promise.resolve().then(async () => {
			this.#controller.abort();
			const result = await Promise.allSettled([...this.#resources].map(async (cleanup) => cleanup()));
			this.#resources.clear();
			const failures = result.filter((item) => item.status === 'rejected').map((item) => item.reason);
			if (failures.length) throw new AggregateError(failures, 'WORKSPACE_SESSION_CLOSE_FAILED');
		}));
	}
}
