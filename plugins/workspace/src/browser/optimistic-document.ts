import type { PluginTasksApi } from 'nexus-terminal/browser';
import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';

/** Serialize writes against confirmed versions and replay only unsaved edits over each response.
 * Adjacent settings edits coalesce; resource mutations share the same queue. A failed/uncertain
 * write is read back, never retried automatically, and cannot discard a later user edit.
 */
export function createOptimisticDocument<T>(
	initial: T,
	options: {
		read: () => Promise<T>;
		write: (value: T) => Promise<T>;
		report: (cause: unknown) => void;
		signal: AbortSignal;
		tasks?: PluginTasksApi;
	},
): {
	state: ShallowRef<T>;
	loaded: Ref<boolean>;
	busy: Ref<boolean>;
	refresh: () => Promise<boolean>;
	mutate: (run: (value: T) => Promise<T>) => Promise<boolean>;
	change: (apply: (value: T) => T) => Promise<boolean>;
	flush: () => Promise<void>;
} {
	let confirmed = initial;
	const state: ShallowRef<T> = shallowRef(initial);
	const loaded = ref(false),
		busy = ref(false);
	type Operation = {
		read?: boolean;
		apply?: (value: T) => T;
		run?: (value: T) => Promise<T>;
		resolve: (ok: boolean) => void;
	};
	const pending: Operation[] = [];
	let worker: Promise<void> | undefined;

	function publish() {
		state.value = pending.reduce((value, operation) => operation.apply?.(value) ?? value, confirmed);
	}

	async function drain() {
		while (pending.length) {
			if (options.signal.aborted) {
				for (const item of pending.splice(0)) item.resolve(false);
				publish();
				break;
			}
			const first = pending[0];
			const count = first.apply ? pending.findIndex((item) => !item.apply) : 1;
			const batch = pending.slice(0, count < 0 ? pending.length : count);
			let ok = false;
			try {
				const result = first.run
					? await first.run(confirmed)
					: await options.write(batch.reduce((value, item) => item.apply!(value), confirmed));
				options.signal.throwIfAborted();
				confirmed = result;
				loaded.value = true;
				ok = true;
			} catch (cause) {
				if (!options.signal.aborted) {
					options.report(cause);
					try {
						const recovered = await options.read();
						options.signal.throwIfAborted();
						confirmed = recovered;
						loaded.value = true;
					} catch (readError) {
						if (!options.signal.aborted) options.report(readError);
					}
				}
			}
			pending.splice(0, batch.length);
			publish();
			for (const item of batch) item.resolve(ok);
		}
		busy.value = false;
		worker = undefined;
	}

	function enqueue(operation: Omit<Operation, 'resolve'>) {
		if (options.signal.aborted || (operation.apply && !loaded.value)) return Promise.resolve(false);
		const result = new Promise<boolean>((resolve) => pending.push({ ...operation, resolve }));
		publish();
		busy.value = true;
		worker ??= options.tasks
			? options.tasks
					.run(async () => {
						await Promise.resolve();
						await drain();
					})
					.catch((cause) => {
						// The owner can be revoked before the runner invokes drain at all.
						// Settle accepted callers as well as the worker in that case.
						for (const item of pending.splice(0)) item.resolve(false);
						publish();
						busy.value = false;
						worker = undefined;
						if (!options.signal.aborted) options.report(cause);
					})
			: Promise.resolve().then(drain);
		return result;
	}

	return {
		state,
		loaded,
		busy,

		refresh: () => enqueue({ run: options.read, read: true }),

		mutate: (run: (value: T) => Promise<T>) => (loaded.value ? enqueue({ run }) : Promise.resolve(false)),

		change: (apply: (value: T) => T) => enqueue({ apply }),

		flush: async () => {
			while (worker && pending.some((operation) => !operation.read)) await worker;
		},
	};
}
