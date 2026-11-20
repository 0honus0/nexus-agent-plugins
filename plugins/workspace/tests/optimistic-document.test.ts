import { expect, it, vi } from 'vitest';
import { createOptimisticDocument } from '../src/browser/optimistic-document';
import { mergeTerminalDisplay } from '../src/browser/appearance/terminal-display';
import { TerminalDisplaySchema } from '../src/shared/workspace-terminal-types';
import { taskOwner } from './fixtures/task-owner';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (cause: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const initial = () => ({ version: 0, display: TerminalDisplaySchema.parse({}), resources: [] as string[] });

type Snapshot = ReturnType<typeof initial>;

it('settles accepted reads if the plugin is revoked before its task starts', async () => {
	const { ctx, controller } = taskOwner();
	const read = vi.fn(async () => initial());
	const document = createOptimisticDocument(initial(), {
		read,
		write: vi.fn(),
		report: vi.fn(),
		signal: controller.signal,
		tasks: ctx.app.tasks,
	});
	const loading = document.refresh();
	controller.abort();
	await expect(loading).resolves.toBe(false);
	expect(document.busy.value).toBe(false);
	expect(read).not.toHaveBeenCalled();
});

async function setup() {
	let saved = initial();
	const read = vi.fn(async () => saved);
	const write = vi.fn(async (value: Snapshot) => (saved = { ...value, version: value.version + 1 }));
	const report = vi.fn();
	const controller = new AbortController();
	const document = createOptimisticDocument(saved, { read, write, report, signal: controller.signal });
	await document.refresh();
	return { document, write, read, report, controller };
}

it('immediately applies and coalesces adjacent field edits using the confirmed version', async () => {
	const { document, write } = await setup();
	const a = document.change((value) => ({
		...value,
		display: mergeTerminalDisplay(value.display, { fontFamily: 'Test Mono' }),
	}));
	const b = document.change((value) => ({
		...value,
		display: mergeTerminalDisplay(value.display, { stroke: { enabled: true } }),
	}));
	expect(document.state.value.display).toMatchObject({ fontFamily: 'Test Mono', stroke: { enabled: true } });
	await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
	expect(write).toHaveBeenCalledTimes(1);
	expect(write.mock.calls[0][0].version).toBe(0);
	expect(document.state.value.version).toBe(1);
});

it('keeps later edits when an earlier field save fails without replaying the failed field', async () => {
	const { document, write, read, report } = await setup();
	const first = deferred<Snapshot>();
	write.mockImplementationOnce(() => first.promise);
	const a = document.change((value) => ({
		...value,
		display: mergeTerminalDisplay(value.display, { fontFamily: 'Rejected Font' }),
	}));
	await Promise.resolve();
	const b = document.change((value) => ({
		...value,
		display: mergeTerminalDisplay(value.display, { stroke: { enabled: true } }),
	}));
	first.reject({ code: 'WORKSPACE_STORAGE_FAILED' });
	await expect(Promise.all([a, b])).resolves.toEqual([false, true]);
	expect(document.state.value.display.fontFamily).toBe(initial().display.fontFamily);
	expect(document.state.value.display.stroke.enabled).toBe(true);
	expect(write.mock.calls[1][0].display.fontFamily).toBe(initial().display.fontFamily);
	expect(read).toHaveBeenCalledTimes(2);
	expect(report).toHaveBeenCalledTimes(1);
});

it('retains the newest same-field edit while a previous response arrives', async () => {
	const { document, write } = await setup();
	const first = deferred<Snapshot>();
	write.mockImplementationOnce(() => first.promise);
	const a = document.change((value) => ({ ...value, display: { ...value.display, fontFamily: 'First Font' } }));
	await Promise.resolve();
	const b = document.change((value) => ({ ...value, display: { ...value.display, fontFamily: 'Latest Font' } }));
	first.resolve({ ...initial(), version: 1, display: { ...initial().display, fontFamily: 'First Font' } });
	await a;
	expect(document.state.value.display.fontFamily).toBe('Latest Font');
	await b;
	expect(write.mock.calls[1][0]).toMatchObject({ version: 1, display: { fontFamily: 'Latest Font' } });
});

it('serializes resource mutations and settings without letting a snapshot erase a pending edit', async () => {
	const { document, write } = await setup();
	const response = deferred<Snapshot>();
	const mutation = document.mutate(() => response.promise);
	await Promise.resolve();
	const change = document.change((value) => ({
		...value,
		display: { ...value.display, fontFamily: 'Pending Font' },
	}));
	response.resolve({ ...initial(), resources: ['theme'], version: 3 });
	await mutation;
	expect(document.state.value).toMatchObject({ resources: ['theme'], display: { fontFamily: 'Pending Font' } });
	await change;
	expect(write.mock.calls[0][0].version).toBe(3);
});

it('reads back an uncertain write without retrying it, then continues newer edits from the read version', async () => {
	const { document, write, read } = await setup();
	const first = deferred<Snapshot>();
	write.mockImplementationOnce(() => first.promise);
	const a = document.change((value) => ({
		...value,
		display: { ...value.display, fontFamily: 'Saved But Response Lost' },
	}));
	await Promise.resolve();
	const b = document.change((value) => ({
		...value,
		display: mergeTerminalDisplay(value.display, { shadow: { enabled: true } }),
	}));
	read.mockResolvedValueOnce({
		...initial(),
		version: 1,
		display: { ...initial().display, fontFamily: 'Saved But Response Lost' },
	});
	first.reject({ code: 'NETWORK_ERROR' });
	await Promise.all([a, b]);
	expect(write).toHaveBeenCalledTimes(2);
	expect(write.mock.calls[1][0]).toMatchObject({
		version: 1,
		display: { fontFamily: 'Saved But Response Lost', shadow: { enabled: true } },
	});
});

it('flush waits for writes queued during an in-flight request; abort drops unsent writes', async () => {
	const { document, write, controller } = await setup();
	const first = deferred<Snapshot>();
	write.mockImplementationOnce(() => first.promise);
	const a = document.change((value) => ({ ...value, version: value.version }));
	await Promise.resolve();
	const b = document.change((value) => ({ ...value, display: { ...value.display, fontFamily: 'Unsent' } }));
	let flushed = false;
	const flush = document.flush().then(() => {
		flushed = true;
	});
	await Promise.resolve();
	expect(flushed).toBe(false);
	controller.abort();
	first.resolve({ ...initial(), version: 1 });
	await flush;
	await expect(a).resolves.toBe(false);
	await expect(b).resolves.toBe(false);
	expect(write).toHaveBeenCalledTimes(1);
	expect(document.state.value.display.fontFamily).toBe(initial().display.fontFamily);
	expect(document.busy.value).toBe(false);
});

it('does not turn a pending initial read into a save barrier', async () => {
	const read = deferred<Snapshot>();
	const document = createOptimisticDocument(initial(), {
		read: () => read.promise,

		write: vi.fn(),
		report: vi.fn(),
		signal: new AbortController().signal,
	});
	const loading = document.refresh();
	await document.flush();
	expect(document.loaded.value).toBe(false);
	read.resolve(initial());
	await expect(loading).resolves.toBe(true);
});
