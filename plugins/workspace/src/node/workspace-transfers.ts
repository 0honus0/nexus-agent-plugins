import { randomUUID } from 'node:crypto';
import PQueue from 'p-queue';
import type { TransferTask } from '../shared/workspace-transfer-types';
import { isTransferFinished } from '../shared/workspace-transfer-types';
import { WorkspaceError, describeWorkspaceRequestError } from './workspace-error';

type TaskInput = Pick<
	TransferTask,
	'kind' | 'label' | 'source' | 'destination' | 'sessionIds' | 'paths' | 'destinationPath'
> &
	Partial<Pick<TransferTask, 'id' | 'batchId' | 'totalBytes' | 'method'>>;

export interface TransferProgress {
	readonly signal: AbortSignal;
	update(
		patch: Partial<
			Pick<
				TransferTask,
				| 'state'
				| 'bytes'
				| 'totalBytes'
				| 'currentFile'
				| 'method'
				| 'fallback'
				| 'completedItems'
				| 'totalItems'
			>
		>,
	): void;
}

type Action = (progress: TransferProgress, overwrite: boolean) => Promise<void>;

interface TransferRecord {
	task: TransferTask;
	controller: AbortController;
	action: Action;
	done: Promise<void>;
}

/** Bounded queue/history, throttled deltas and backend-owned cancellation. No file bytes enter WS. */
export function createWorkspaceTransfers(lifetime: AbortSignal, onState: (task: TransferTask) => void = () => {}) {
	const queue = new PQueue({ concurrency: 4 });
	const records = new Map<string, TransferRecord>();
	const listeners = new Set<(event: { type: 'changed'; tasks: TransferTask[]; removed: string[] }) => void>();
	const dirty = new Set<string>(),
		removed = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const snapshot = (task: TransferTask): TransferTask => structuredClone(task);

	function flush() {
		clearTimeout(timer);
		timer = undefined;
		const event = {
			type: 'changed' as const,
			tasks: [...dirty].flatMap((id) => (records.has(id) ? [snapshot(records.get(id)!.task)] : [])),
			removed: [...removed],
		};
		dirty.clear();
		removed.clear();
		if (event.tasks.length || event.removed.length) for (const listener of listeners) listener(event);
	}

	function changed(id: string) {
		dirty.add(id);
		timer ??= setTimeout(flush, 150);
		timer.unref();
	}

	function get(id: string) {
		const record = records.get(id);
		if (!record) throw new WorkspaceError('WORKSPACE_TRANSFER_NOT_FOUND', 404);
		return record;
	}

	function finishedGroups() {
		const groups = new Map<string, TransferRecord[]>();
		for (const record of records.values()) {
			const key = record.task.batchId ?? record.task.id;
			groups.set(key, [...(groups.get(key) ?? []), record]);
		}
		return [...groups.values()]
			.filter((items) => items.every((item) => isTransferFinished(item.task.state)))
			.sort(
				(a, b) =>
					Math.max(...b.map((item) => item.task.updatedAt)) -
					Math.max(...a.map((item) => item.task.updatedAt)),
			);
	}

	function prune() {
		for (const items of finishedGroups().slice(100))
			for (const { task } of items) {
				records.delete(task.id);
				dirty.delete(task.id);
				removed.add(task.id);
			}
	}

	function start(
		input: TaskInput,
		action: Action,
		options: { retryable?: boolean; signal?: AbortSignal; overwrite?: boolean } = {},
	) {
		lifetime.throwIfAborted();
		if ([...records.values()].filter((r) => !isTransferFinished(r.task.state)).length >= 128)
			throw new WorkspaceError('WORKSPACE_TRANSFER_LIMIT', 409);
		const id = input.id ?? randomUUID();
		if (records.has(id)) throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
		const controller = new AbortController();
		const signal = AbortSignal.any([lifetime, controller.signal, ...(options.signal ? [options.signal] : [])]);
		const task: TransferTask = {
			...input,
			id,
			state: 'queued',
			bytes: 0,
			totalBytes: input.totalBytes ?? null,
			completedItems: 0,
			totalItems: input.paths.length,
			currentFile: '',
			speed: 0,
			fallback: false,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			retryable: options.retryable ?? false,
		};
		let execution: Promise<void> | undefined;
		let started = false,
			sampledAt = performance.now(),
			sampledBytes = 0;
		const record = { task, controller, action, done: Promise.resolve() };
		records.set(id, record);
		onState(snapshot(task));
		changed(id);

		const fail = (cause: unknown) => {
			const error = describeWorkspaceRequestError(cause, 'transfer');
			task.state =
				String(error.code).includes('UNKNOWN') ||
				error.code === 'WORKSPACE_TRANSFER_ROLLBACK_FAILED' ||
				error.code === 'REMOTE_TOOLS_TRANSFER_CLEANUP'
					? 'unknown'
					: signal.aborted
						? 'canceled'
						: 'failed';
			task.error = error;
			onState(snapshot(task));
			if (!task.retryable) record.action = async () => {};
			task.speed = 0;
			task.updatedAt = Date.now();
			changed(id);
			prune();
		};

		record.done = queue
			.add(
				() =>
					(execution = (async () => {
						started = true;
						const progress: TransferProgress = {
							signal,

							update(patch) {
								if (isTransferFinished(task.state)) return;
								const previousState = task.state;
								Object.assign(task, patch);
								if (previousState !== task.state) onState(snapshot(task));
								task.updatedAt = Date.now();
								const now = performance.now(),
									elapsed = (now - sampledAt) / 1000;
								if (elapsed >= 0.4) {
									task.speed = Math.max(0, (task.bytes - sampledBytes) / elapsed);
									sampledAt = now;
									sampledBytes = task.bytes;
								}
								changed(id);
							},
						};
						try {
							signal.throwIfAborted();
							progress.update({ state: 'preparing' });
							await action(progress, options.overwrite ?? false);
							signal.throwIfAborted();
							if (!task.retryable) record.action = async () => {};
							task.state = 'completed';
							onState(snapshot(task));
							task.speed = 0;
							task.updatedAt = Date.now();
							changed(id);
							prune();
						} catch (cause) {
							fail(cause);
							throw cause;
						}
					})()),
				{ signal },
			)
			.then(
				() => {},
				async (cause) => {
					if (started && execution) return execution;
					fail(cause);
					throw cause;
				},
			);
		void record.done.catch(() => {});
		return { task: snapshot(task), done: record.done };
	}

	return {
		start,

		list: () => [...records.values()].map((r) => snapshot(r.task)),

		cancel(id: string) {
			const r = get(id);
			if (!isTransferFinished(r.task.state)) r.controller.abort();
		},

		async cancelSession(id: string) {
			const items = [...records.values()].filter(
				(r) => r.task.sessionIds.includes(id) && !isTransferFinished(r.task.state),
			);
			for (const r of items) r.controller.abort();
			await Promise.allSettled(items.map((r) => r.done));
		},

		retry(id: string, overwrite: boolean) {
			const r = get(id);
			if (!r.task.retryable || !['failed', 'canceled'].includes(r.task.state))
				throw new WorkspaceError('WORKSPACE_CONFLICT', 409);
			const {
				kind,
				label,
				source,
				destination,
				sessionIds,
				paths,
				destinationPath,
				totalBytes,
				method,
				batchId,
			} = r.task;
			const input = {
				kind,
				label,
				source,
				destination,
				sessionIds,
				paths,
				destinationPath,
				totalBytes,
				method,
				batchId,
			};
			return start(input, r.action, { retryable: true, overwrite }).task;
		},

		clear() {
			for (const group of finishedGroups())
				for (const { task } of group) {
					records.delete(task.id);
					dirty.delete(task.id);
					removed.add(task.id);
				}
			flush();
		},

		subscribe(listener: (event: { type: 'changed'; tasks: TransferTask[]; removed: string[] }) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		async dispose() {
			for (const r of records.values()) r.controller.abort();
			await Promise.allSettled([...records.values()].map((r) => r.done));
			clearTimeout(timer);
			listeners.clear();
			records.clear();
		},
	};
}
