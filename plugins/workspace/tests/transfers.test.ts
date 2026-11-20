import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createWorkspaceTransfers } from '../src/node/workspace-transfers';
import { WorkspaceError } from '../src/node/workspace-error';
import { TransferEventSchema } from '../src/shared/workspace-transfer-types';
import { selectDownloadRange } from '../src/node/workspace-download-range';

const input = () => ({
	kind: 'copy' as const,
	label: 'file',
	source: 'A',
	destination: 'B',
	sessionIds: [randomUUID()],
	paths: ['/file'],
	destinationPath: '/target',
});

it('publishes throttled validated deltas and snapshots; clearing history never removes active work', async () => {
	const service = createWorkspaceTransfers(new AbortController().signal);
	const changes: unknown[] = [];
	service.subscribe((event) => changes.push(event));
	let finish!: () => void;
	const task = service.start(input(), async (progress) => {
		progress.update({ state: 'transferring', totalBytes: 10, bytes: 5 });
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
	});
	service.clear();
	expect(service.list()).toHaveLength(1);
	finish();
	await task.done;
	await vi.waitFor(() => expect(changes.length).toBeGreaterThan(0));
	expect(TransferEventSchema.parse(changes.at(-1)).type).toBe('changed');
	expect(service.list()[0]).toMatchObject({ state: 'completed', bytes: 5 });
	service.clear();
	expect(service.list()).toEqual([]);
	await service.dispose();
});

it('bounds execution, cancels queued jobs without running them, and waits for active cleanup', async () => {
	const service = createWorkspaceTransfers(new AbortController().signal);
	const blockers: (() => void)[] = [];
	const running = Array.from({ length: 4 }, () =>
		service.start(input(), async (progress) => {
			await new Promise<void>((resolve) =>
				progress.signal.addEventListener('abort', () => blockers.push(resolve), { once: true }),
			);
			progress.signal.throwIfAborted();
		}),
	);
	const spy = vi.fn(async () => {}),
		queued = service.start(input(), spy);
	service.cancel(queued.task.id);
	await expect(queued.done).rejects.toBeDefined();
	expect(spy).not.toHaveBeenCalled();
	const stopping = service.cancelSession(running[0].task.sessionIds[0]);
	let stopped = false;
	void stopping.then(() => {
		stopped = true;
	});
	await Promise.resolve();
	expect(stopped).toBe(false);
	blockers.shift()!();
	await stopping;
	for (const item of running.slice(1)) service.cancel(item.task.id);
	for (const unblock of blockers.splice(0)) unblock();
	await Promise.allSettled(running.map((item) => item.done));
	expect(service.list().every((task) => task.state === 'canceled')).toBe(true);
	await service.dispose();
});

it('retries with a new identity and fresh progress, and forbids retry of unknown outcomes', async () => {
	const service = createWorkspaceTransfers(new AbortController().signal);
	const work = vi.fn(async (_progress, overwrite) => {
		if (!overwrite) throw new WorkspaceError('WORKSPACE_FILE_EXISTS', 409);
	});
	const failed = service.start(input(), work, { retryable: true });
	await expect(failed.done).rejects.toBeDefined();
	const retried = service.retry(failed.task.id, true);
	expect(retried.id).not.toBe(failed.task.id);
	expect(retried.error).toBeUndefined();
	await vi.waitFor(() => expect(service.list().find((task) => task.id === retried.id)?.state).toBe('completed'));
	const unknown = service.start(
		input(),
		async () => {
			throw new WorkspaceError('WORKSPACE_TRANSFER_UNKNOWN');
		},
		{ retryable: true },
	);
	await expect(unknown.done).rejects.toBeDefined();
	expect(() => service.retry(unknown.task.id, false)).toThrow();
	await service.dispose();
});

it('selects byte ranges including suffixes and rejects invalid/unsatisfiable selections', () => {
	expect(selectDownloadRange(undefined, 10)).toBeNull();
	expect(selectDownloadRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
	expect(selectDownloadRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 });
	expect(selectDownloadRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
	expect(selectDownloadRange('bytes=0-999', 10)).toEqual({ start: 0, end: 9 });
	for (const range of ['bytes=10-', 'bytes=-0', 'bytes=7-2', 'bytes=0-1,3-4', 'bytes=9007199254740993-', 'bytes=-'])
		expect(() => selectDownloadRange(range, 10)).toThrow();
	expect(() => selectDownloadRange('bytes=0-', 0)).toThrow();
});

it('keeps completed upload members in a batch denominator until the entire batch settles', async () => {
	const { groupTransferTasks } = await import('../src/browser/transfers/transfer-presentation');
	const service = createWorkspaceTransfers(new AbortController().signal);
	const batchId = randomUUID();
	const first = service.start({ ...input(), kind: 'upload', batchId, totalBytes: 100 }, async (progress) => {
		progress.update({ bytes: 100 });
	});
	await first.done;
	let finish!: () => void;
	const second = service.start({ ...input(), kind: 'upload', batchId, totalBytes: 100 }, async (progress) => {
		progress.update({ state: 'transferring', bytes: 50 });
		await new Promise<void>((resolve) => {
			finish = resolve;
		});
	});
	service.clear();
	expect(service.list()).toHaveLength(2);
	expect(groupTransferTasks(service.list())[0]).toMatchObject({ state: 'transferring', bytes: 150, totalBytes: 200 });
	finish();
	await second.done;
	expect(groupTransferTasks(service.list())[0].state).toBe('completed');
	service.clear();
	expect(service.list()).toEqual([]);
	await service.dispose();
});
