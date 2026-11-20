import { ref, computed, inject, onScopeDispose, type InjectionKey } from 'vue';
import PQueue from 'p-queue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import type { PluginWindowApi } from 'nexus-terminal/browser';
import { TransferEventSchema, isTransferFinished, type TransferTask } from '../../shared/workspace-transfer-types';
import { describeWorkspaceError } from '../workspace-error';
import { createWorkspaceClient } from '../workspace-client';
import { groupTransferTasks } from './transfer-presentation';

/** One store per Workspace window. Panel visibility and tab changes never own task lifetimes. */
export function createWorkspaceTransfers(ctx: PluginContextApi, view: PluginWindowApi, completed: () => void) {
	const tasks = ref<TransferTask[]>([]),
		open = ref(false),
		connected = ref(false);
	const lifetime = new AbortController();
	const signal = AbortSignal.any([ctx.signal, view.signal, lifetime.signal]);
	const client = createWorkspaceClient(ctx, signal);
	const uploads = new PQueue({ concurrency: 3 });
	const retryFiles = new Map<string, { file: File; sessionId: string; directory: string }>();
	const completedIds = new Set<string>();
	const backendIds = new Set<string>();
	const controllers = new Map<string, AbortController>();
	ctx.app.ws.connect('/transfers', {
		signal,
		autoReconnect: { retries: Infinity, delay: 1500 },

		onConnected() {
			connected.value = true;
		},

		onDisconnected() {
			connected.value = false;
		},

		onMessage(_socket, event) {
			try {
				const value = TransferEventSchema.parse(JSON.parse(event.data));
				if (value.type === 'snapshot') {
					const incoming = new Set(value.tasks.map((task) => task.id));
					for (const id of backendIds)
						if (!incoming.has(id)) {
							retryFiles.delete(id);
							completedIds.delete(id);
						}
					const local = tasks.value.filter(
						(task) => !backendIds.has(task.id) && !incoming.has(task.id) && retryFiles.has(task.id),
					);
					backendIds.clear();
					for (const task of value.tasks) backendIds.add(task.id);
					tasks.value = [...value.tasks, ...local];
				} else {
					const current = new Map(tasks.value.map((task) => [task.id, task]));
					for (const id of value.removed) {
						current.delete(id);
						backendIds.delete(id);
						retryFiles.delete(id);
						completedIds.delete(id);
					}
					for (const task of value.tasks) {
						backendIds.add(task.id);
						current.set(task.id, task);
					}
					tasks.value = [...current.values()];
				}
				for (const task of tasks.value)
					if (isTransferFinished(task.state) && !completedIds.has(task.id)) {
						completedIds.add(task.id);
						if (task.state === 'completed') {
							retryFiles.delete(task.id);
							completed();
						}
						if (task.error && ['failed', 'unknown'].includes(task.state))
							ctx.app.log.report({
								level: 'error',
								code:
									typeof task.error.code === 'string'
										? task.error.code
										: 'WORKSPACE_OPERATION_FAILED',
								params: { taskId: task.id },
								userVisible: false,
							});
					}
			} catch (cause) {
				client.report(cause);
			}
		},
	});
	onScopeDispose(() => {
		lifetime.abort();
		uploads.clear();
		retryFiles.clear();
	});
	const active = computed(() => tasks.value.filter((task) => !isTransferFinished(task.state)));
	const history = computed(() =>
		groupTransferTasks(tasks.value)
			.filter((task) => isTransferFinished(task.state))
			.sort((a, b) => b.updatedAt - a.updatedAt),
	);

	function upload(
		sessionId: string,
		directory: string,
		files: FileList | File[],
		overwrite = false,
		destination = '',
	) {
		const batchId = crypto.randomUUID();
		for (const file of Array.from(files)) {
			const id = crypto.randomUUID();
			retryFiles.set(id, { file, sessionId, directory });
			controllers.set(id, new AbortController());
			tasks.value.push({
				id,
				batchId,
				kind: 'upload',
				state: 'queued',
				label: file.name,
				source: '',
				destination,
				paths: [directory.replace(/\/$/, '') + '/' + file.name],
				destinationPath: directory,
				sessionIds: [sessionId],
				totalBytes: file.size,
				bytes: 0,
				completedItems: 0,
				totalItems: 1,
				currentFile: '',
				speed: 0,
				fallback: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				retryable: false,
			});
			void sendUpload(id, batchId, sessionId, directory, file, overwrite);
		}
	}

	async function sendUpload(
		id: string,
		batchId: string,
		sessionId: string,
		directory: string,
		file: File,
		overwrite: boolean,
	) {
		const controller = controllers.get(id)!;
		const uploadSignal = AbortSignal.any([signal, controller.signal]);
		try {
			await uploads.add(
				async () => {
					uploadSignal.throwIfAborted();
					const query = new URLSearchParams({
						path: directory.replace(/\/$/, '') + '/' + file.name,
						taskId: id,
						batchId,
						size: String(file.size),
						overwrite: String(overwrite),
					});
					await client.binary('sessions/' + sessionId + '/file?' + query, {
						method: 'PUT',
						body: file,
						headers: { 'Content-Type': 'application/octet-stream' },
						signal: uploadSignal,
					});
				},
				{ signal: uploadSignal },
			);
		} catch (cause) {
			if (!backendIds.has(id)) {
				const task = tasks.value.find((task) => task.id === id);
				if (task) {
					task.state = uploadSignal.aborted ? 'canceled' : 'failed';
					task.error = describeWorkspaceError(cause, 'upload', 'WORKSPACE_OPERATION_FAILED');
					task.updatedAt = Date.now();
				}
			}
			if (!uploadSignal.aborted && !backendIds.has(id)) client.report(cause);
		} finally {
			controllers.delete(id);
		}
	}

	async function download(sessionId: string, path: string) {
		try {
			const query = new URLSearchParams({ path });
			const url = client.url('sessions/' + sessionId + '/file?' + query);
			await client.binary('sessions/' + sessionId + '/file?' + query, { method: 'HEAD', signal });
			if (signal.aborted) return;
			const link = document.createElement('a');
			link.href = url;
			link.download = path.split('/').pop() ?? '';
			document.body.append(link);
			link.click();
			link.remove();
		} catch (cause) {
			client.report(cause);
		}
	}

	return {
		tasks,
		active,
		history,
		open,
		connected,
		upload,
		download,

		hasPending: (id?: string) => active.value.some((task) => !id || task.sessionIds.includes(id)),

		canRetry: (task: TransferTask) =>
			['failed', 'canceled'].includes(task.state) &&
			(task.retryable || retryFiles.has(task.id) || task.kind === 'download'),

		async retry(task: TransferTask, overwrite = false) {
			try {
				const local = retryFiles.get(task.id);
				if (local) {
					retryFiles.delete(task.id);
					upload(local.sessionId, local.directory, [local.file], overwrite);
					return;
				}
				if (task.kind === 'download') {
					await download(task.sessionIds[0], task.paths[0]);
					return;
				}
				await client.request('transfers/' + task.id + '/retry', 'POST', { overwrite });
			} catch (cause) {
				client.report(cause);
			}
		},

		async cancel(task: TransferTask) {
			try {
				controllers.get(task.id)?.abort();
				if (!backendIds.has(task.id)) return;
				await client.request('transfers/' + task.id + '/cancel', 'POST');
			} catch (cause) {
				client.report(cause);
			}
		},

		async clear() {
			try {
				const groups = new Set(history.value.map((task) => task.id));
				await client.request('transfers/history', 'DELETE');
				for (const task of tasks.value)
					if (groups.has(task.batchId ?? task.id)) {
						retryFiles.delete(task.id);
						completedIds.delete(task.id);
						backendIds.delete(task.id);
					}
				tasks.value = tasks.value.filter((task) => !groups.has(task.batchId ?? task.id));
			} catch (cause) {
				client.report(cause);
			}
		},
	};
}

export type WorkspaceTransfers = ReturnType<typeof createWorkspaceTransfers>;

export const workspaceTransfersKey: InjectionKey<WorkspaceTransfers> = Symbol('workspace-transfers');

export const useWorkspaceTransfers = () => inject(workspaceTransfersKey);
