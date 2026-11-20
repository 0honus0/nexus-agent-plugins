import { effectScope, ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import type { PluginContextApi } from 'nexus-terminal/browser';
import { FileEntrySchema } from '../src/shared/workspace-file-types';
import { useFileOperations } from '../src/browser/files/use-file-operations';

const { request, report, changed } = vi.hoisted(() => ({ request: vi.fn(), report: vi.fn(), changed: vi.fn() }));
vi.mock('../src/browser/workspace-client', () => ({ createWorkspaceClient: () => ({ request, report }) }));
vi.mock('../src/browser/files/workspace-files-state', () => ({
	useWorkspaceFilesState: () => ({ sessions: { value: [] }, connections: { value: [] }, changed }),
}));

afterEach(() => {
	vi.resetAllMocks();
});

const file = FileEntrySchema.parse({
	name: 'note.txt',
	path: '/note.txt',
	kind: 'file',
	size: 1,
	modifiedAt: 0,
	mode: 0o644,
});
const folder = FileEntrySchema.parse({ ...file, name: 'folder', path: '/folder', kind: 'directory' });

function setup(confirm?: () => boolean) {
	request.mockResolvedValue(undefined);
	const scope = effectScope();
	const files = { path: ref('/'), mutating: ref(false), load: vi.fn() };
	const operations = scope.run(() =>
		useFileOperations({} as PluginContextApi, 'session', new AbortController().signal, files, confirm),
	)!;
	return { operations, files, scope };
}

it.each([[file], [folder], [file, folder]])(
	'requires confirmation by default before deleting %j',
	async (...entries) => {
		const { operations, scope } = setup();
		try {
			await operations.open('remove', entries);
			expect(operations.state.kind).toBe('remove');
			expect(request).not.toHaveBeenCalled();
			operations.close();
			expect(request).not.toHaveBeenCalled();
			await operations.open('remove', entries);
			await operations.save();
			expect(request).toHaveBeenCalledExactlyOnceWith('sessions/session/files/remove', 'POST', {
				paths: entries.map((entry) => entry.path),
			});
			expect(changed).toHaveBeenCalledTimes(1);
		} finally {
			scope.stop();
		}
	},
);

it.each([[file], [folder], [file, folder]])(
	'deletes without opening a dialog when disabled: %j',
	async (...entries) => {
		const { operations, scope } = setup(() => false);
		try {
			const pending = operations.open('remove', entries);
			expect(operations.state.kind).toBeUndefined();
			await pending;
			expect(request).toHaveBeenCalledExactlyOnceWith('sessions/session/files/remove', 'POST', {
				paths: entries.map((entry) => entry.path),
			});
			expect(changed).toHaveBeenCalledTimes(1);
		} finally {
			scope.stop();
		}
	},
);

it('reads the current preference for each operation and still confirms non-deletion operations', async () => {
	const confirmation = ref(true);
	const { operations, scope } = setup(() => confirmation.value);
	try {
		operations.open('remove', [file]);
		expect(request).not.toHaveBeenCalled();
		operations.close();
		confirmation.value = false;
		await operations.open('remove', [file]);
		expect(request).toHaveBeenCalledTimes(1);
		confirmation.value = true;
		operations.open('remove', [folder]);
		expect(operations.state.kind).toBe('remove');
		expect(request).toHaveBeenCalledTimes(1);
		operations.close();
		confirmation.value = false;
		operations.open('rename', [file]);
		expect(operations.state.kind).toBe('rename');
		expect(request).toHaveBeenCalledTimes(1);
	} finally {
		scope.stop();
	}
});

it('blocks duplicate direct deletions, captures the selection and reports failures without opening a dialog', async () => {
	let reject!: (cause: unknown) => void;
	request.mockImplementationOnce(
		() =>
			new Promise((_resolve, fail) => {
				reject = fail;
			}),
	);
	const { operations, files, scope } = setup(() => false);
	try {
		const selection = [file];
		const pending = operations.open('remove', selection);
		selection.splice(0, 1, folder);
		expect(files.mutating.value).toBe(true);
		operations.open('remove', [folder]);
		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][2]).toEqual({ paths: ['/note.txt'] });
		const error = { code: 'SFTP_PERMISSION_DENIED' };
		reject(error);
		await pending;
		expect(report).toHaveBeenCalledWith(error);
		expect(files.mutating.value).toBe(false);
		expect(operations.state.kind).toBeUndefined();
		expect(changed).not.toHaveBeenCalled();
	} finally {
		scope.stop();
	}
});

it('does not delete an empty selection', async () => {
	const { operations, scope } = setup(() => false);
	try {
		await operations.open('remove', []);
		expect(request).not.toHaveBeenCalled();
		expect(operations.state.kind).toBeUndefined();
	} finally {
		scope.stop();
	}
});
