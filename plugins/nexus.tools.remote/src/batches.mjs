import { AgentFailure } from '../../../lib/model-tools/failure.mjs';
import { TOOL_RESULT_MAX_BYTES } from '../../../lib/model-tools/limits.mjs';

function mutationProjection(kind, value) {
	if (kind === 'write') {
		return { path: value.path, status: value.status, bytes: value.bytes, sha256: value.sha256 };
	}
	if (kind === 'move') {
		return {
			path: value.path,
			destinationPath: value.destinationPath,
			kind: value.kind,
			fingerprint: value.fingerprint,
		};
	}
	if (kind === 'delete') {
		return { path: value.path, kind: value.kind, fileCount: value.fileCount, directoryCount: value.directoryCount };
	}
	return { containerId: value.containerId, action: value.action, state: value.state };
}

/** Host executes an atomic governed plan; the package owns its model output projection. */
export async function mutateBatch(input, call, signal) {
	signal.throwIfAborted();
	const docker = input.kind === 'docker_control';
	const result = await call({
		operation: docker ? 'docker.control' : `remote.${input.kind}`,
		connectionId: input.connectionId,
		items: input.items,
		onError: input.onError,
	});
	return {
		...(result.failureCode === undefined ? {} : { failureCode: result.failureCode }),
		items: result.items.map((item) => {
			if (item.status === 'completed') {
				return { index: item.index, status: 'completed', value: mutationProjection(input.kind, item.value) };
			}
			return {
				index: item.index,
				status: item.status,
				...(item.failureCode === undefined ? {} : { failureCode: item.failureCode }),
			};
		}),
	};
}

export async function inspectPaths(input, call, signal) {
	const items = [];
	let bytes = 128;
	for (const [index, path] of input.paths.entries()) {
		signal.throwIfAborted();
		let item;
		const response = await call({ operation: 'remote.inspect', connectionId: input.connectionId, path });
		if (response.status === 'ok') {
			const value = response.value;
			item = {
				index,
				path,
				value: {
					path: value.path,
					kind: value.kind,
					fingerprint: value.fingerprint,
					fileCount: value.fileCount,
					directoryCount: value.directoryCount,
					bytes: value.bytes,
				},
			};
		} else {
			item = { index, path, failureCode: response.status };
		}
		const size = Buffer.byteLength(JSON.stringify(item)) + 1;
		if (bytes + size > TOOL_RESULT_MAX_BYTES) {
			if (!items.length) {
				throw new AgentFailure('limit_exceeded');
			}
			return { items, nextIndex: index };
		}
		items.push(item);
		bytes += size;
	}
	return { items, nextIndex: null };
}

export async function inspectContainers(input, call, signal) {
	const items = [];
	for (const [index, containerId] of input.containerIds.entries()) {
		signal.throwIfAborted();
		const response = await call({ operation: 'docker.inspect', connectionId: input.connectionId, containerId });
		if (response.status === 'ok') {
			const value = response.value;
			items.push({
				index,
				containerId: value.containerId,
				state: value.state,
				image: value.image,
				fingerprint: value.fingerprint,
			});
		} else {
			items.push({ index, containerId, failureCode: response.status });
		}
	}
	return { items };
}

export async function deliverFiles(input, call, signal) {
	signal.throwIfAborted();
	const result = await call({ operation: 'remote.deliver', connectionId: input.connectionId, paths: input.paths });
	return {
		items: result.items.map((item) =>
			item.status === 'completed'
				? {
						index: item.index,
						status: 'completed',
						value: {
							id: item.value.id,
							name: item.value.name,
							sizeBytes: item.value.sizeBytes,
							sha256: item.value.sha256,
						},
					}
				: {
						index: item.index,
						status: item.status,
						...(item.failureCode === undefined ? {} : { failureCode: item.failureCode }),
					},
		),
	};
}
