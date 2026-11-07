import { posix } from 'node:path';
import { RemoteToolFailure } from './failure.mjs';
import { AGENT_TOOL_RESULT_MAX_BYTES } from '@nexus-terminal/shared/agent/tools/values';
import {
	REMOTE_FILE_MAX_PATH_BYTES,
	REMOTE_FILE_TEXT_PAGE_MIN_BYTES,
	REMOTE_FILE_TEXT_PAGE_MAX_BYTES,
} from '@nexus-terminal/shared/remote/files/values';
import { isWellFormedFileText } from '@nexus-terminal/shared/remote/files/text-codec';

export function record(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new RemoteToolFailure('invalid_input');
	}
	return value;
}

function integer(value, minimum, maximum) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new RemoteToolFailure('invalid_input');
	}
	return value;
}

function text(value, maxBytes, allowEmpty = false) {
	if (
		typeof value !== 'string' ||
		(!allowEmpty && !value) ||
		!isWellFormedFileText(value) ||
		value.includes('\0') ||
		Buffer.byteLength(value) > maxBytes
	) {
		throw new RemoteToolFailure('invalid_input');
	}
	return value;
}

export function absolutePath(value) {
	const requested = text(value, REMOTE_FILE_MAX_PATH_BYTES);
	if (!requested.startsWith('/') || requested.split('/').includes('..')) {
		throw new RemoteToolFailure('invalid_input');
	}
	return posix.resolve(requested);
}

export function readInput(name, raw) {
	const value = record(raw);
	const fields =
		name === 'file_read' ? ['connectionId', 'paths', 'offset', 'maxBytes'] : ['connectionId', 'paths', 'after'];
	if (
		Object.keys(value).some((key) => !fields.includes(key)) ||
		!Array.isArray(value.paths) ||
		value.paths.length === 0
	) {
		throw new RemoteToolFailure('invalid_input');
	}
	const paths = value.paths.map(absolutePath);
	if (new Set(paths).size !== paths.length) {
		throw new RemoteToolFailure('invalid_input');
	}
	const connectionId = integer(value.connectionId, 1, Number.MAX_SAFE_INTEGER);
	if (name === 'file_read') {
		return {
			connectionId,
			paths,
			offset: value.offset === undefined ? 0 : integer(value.offset, 0, Number.MAX_SAFE_INTEGER),
			maxBytes:
				value.maxBytes === undefined
					? REMOTE_FILE_TEXT_PAGE_MAX_BYTES
					: integer(value.maxBytes, REMOTE_FILE_TEXT_PAGE_MIN_BYTES, REMOTE_FILE_TEXT_PAGE_MAX_BYTES),
		};
	}
	return {
		connectionId,
		paths,
		after: value.after === undefined ? '' : text(value.after, REMOTE_FILE_MAX_PATH_BYTES, true),
	};
}

function pageItem(name, index, path, response) {
	if (response.status === 'not_found' || response.status === 'not_text') {
		return { index, path, failureCode: response.status };
	}
	if (response.status !== 'ok') {
		throw new Error('REMOTE_RESPONSE_MISMATCH');
	}
	const value = response.value;
	if (name === 'file_read') {
		return {
			index,
			path,
			value: {
				path: value.path,
				text: value.text,
				bytes: value.bytes,
				sha256: value.sha256,
				pageSha256: value.pageSha256,
				sizeBytes: value.sizeBytes,
				offset: value.offset,
				nextOffset: value.nextOffset,
				fingerprint: value.fingerprint,
			},
		};
	}
	return {
		index,
		path,
		value: {
			nextAfter: value.nextAfter,
			fingerprint: value.fingerprint,
			entries: value.entries.map((entry) => ({
				name: entry.name,
				kind: entry.kind,
				size: entry.size,
				modifiedAt: entry.modifiedAt,
			})),
		},
	};
}

/** This package owns the former Host paths-batch algorithm; each primitive remains Host governed. */
export async function readFiles(name, input, request, signal) {
	const items = [];
	let bytes = 128;
	for (let index = 0; index < input.paths.length; index++) {
		signal.throwIfAborted();
		const path = input.paths[index];
		const response =
			name === 'file_read'
				? await request(
						{
							operation: 'remote.readTextPage',
							connectionId: input.connectionId,
							path,
							offset: input.offset,
							maxBytes: input.maxBytes,
						},
						signal,
					)
				: await request(
						{
							operation: 'remote.listPage',
							connectionId: input.connectionId,
							path,
							after: input.after,
						},
						signal,
					);
		signal.throwIfAborted();
		const item = pageItem(name, index, path, response);
		const itemBytes = Buffer.byteLength(JSON.stringify(item)) + 1;
		if (bytes + itemBytes > AGENT_TOOL_RESULT_MAX_BYTES) {
			if (items.length === 0) {
				throw new RemoteToolFailure('limit_exceeded');
			}
			return { items, nextIndex: index };
		}
		items.push(item);
		bytes += itemBytes;
	}
	return { items, nextIndex: null };
}
