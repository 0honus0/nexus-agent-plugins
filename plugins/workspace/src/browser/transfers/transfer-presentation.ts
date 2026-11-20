import { isTransferFinished, type TransferTask } from '../../shared/workspace-transfer-types';

/** Group a browser upload batch before selecting active/history, so completed members
 * still contribute to its denominator and the progress never resets mid-batch.
 */
export function groupTransferTasks(tasks: TransferTask[]): TransferTask[] {
	const groups = new Map<string, TransferTask[]>();
	for (const task of tasks) {
		const key = task.batchId ?? task.id;
		groups.set(key, [...(groups.get(key) ?? []), task]);
	}
	return [...groups.values()]
		.map((members) => {
			if (members.length === 1) return members[0];
			const live = members.filter((task) => !isTransferFinished(task.state));
			const current = live.find((task) => task.state !== 'queued') ?? live[0];
			const failed =
				members.find((task) => task.state === 'unknown') ??
				members.find((task) => task.state === 'failed') ??
				members.find((task) => task.state === 'canceled');
			return {
				...members[0],
				id: members[0].batchId!,
				state: current?.state ?? failed?.state ?? 'completed',
				bytes: members.reduce((n, task) => n + task.bytes, 0),
				totalBytes: members.some((task) => task.totalBytes === null)
					? null
					: members.reduce((n, task) => n + task.totalBytes!, 0),
				paths: members.flatMap((task) => task.paths),
				completedItems: members.filter((task) => task.state === 'completed').length,
				totalItems: members.length,
				speed: live.reduce((n, task) => n + task.speed, 0),
				currentFile: current?.label ?? '',
				error: failed?.error,
				createdAt: Math.min(...members.map((task) => task.createdAt)),
				updatedAt: Math.max(...members.map((task) => task.updatedAt)),
			};
		})
		.sort((a, b) => b.createdAt - a.createdAt);
}
