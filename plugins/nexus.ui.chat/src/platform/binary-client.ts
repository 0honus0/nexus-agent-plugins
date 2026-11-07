import { toChatSdkFailure } from '@/platform/sdk-failure';
import { readAgentId } from '@nexus-terminal/shared/agent/http-codec';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
import { HttpRequestFailure } from '@/client/http/request-failure';

async function requestChatBinary(input: {
	method: string;
	url: string;
	body?: string | FormData | Blob;
	headers?: Record<string, string>;
	maxRequestBytes: number;
	maxResponseBytes: number;
	maxErrorBytes: number;
	timeoutMs?: number;
	signal?: AbortSignal;
}): Promise<{ status: number; headers: Headers; bytes: Uint8Array<ArrayBuffer> }> {
	const platform = useAgentChatUiPlatform();
	if (input.signal?.aborted) throw new HttpRequestFailure('cancelled', 'not_dispatched');
	const match = /^\/api\/v1\/agent\/apps\/([^/]+)\/artifacts\/([^/]+)\/content$/u.exec(input.url);
	if (!match || match[1] !== platform.environment.value.appId)
		throw new HttpRequestFailure('invalid_input', 'not_dispatched');
	const artifactId = readAgentId(match[2]);
	if (input.method === 'PUT') {
		const version = /^"([1-9][0-9]*)"$/u.exec(input.headers?.['If-Match'] ?? '');
		if (!version || !(input.body instanceof File) || input.body.size > input.maxRequestBytes)
			throw new HttpRequestFailure('invalid_input', 'not_dispatched');
		const result = await platform.request(
			{ kind: 'artifact.upload', artifactId, expectedVersion: Number(version[1]) },
			input.signal,
			input.body,
		);
		if (result.kind !== 'artifact.upload') throw new HttpRequestFailure('protocol_failure', 'unknown');
		return {
			status: 200,
			headers: new Headers({ 'content-type': 'application/json' }),
			bytes: new TextEncoder().encode(JSON.stringify(result.result)),
		};
	}
	if (input.method !== 'GET') throw new HttpRequestFailure('invalid_input', 'not_dispatched');
	const metadata = await platform.sdk.request(
		{ method: 'agent.artifacts.get', params: { artifactId } },
		input.signal,
	);
	if (metadata.method !== 'agent.artifacts.get') throw new HttpRequestFailure('protocol_failure', 'unknown');
	const original = metadata.value.artifact;
	const range = input.headers?.Range;
	const parsed = range === undefined ? null : /^bytes=([0-9]+)-([0-9]+)$/u.exec(range);
	if (range !== undefined && !parsed) throw new HttpRequestFailure('invalid_input', 'not_dispatched');
	const start = parsed ? Number(parsed[1]) : 0;
	const end = parsed ? Number(parsed[2]) : original.sizeBytes - 1;
	if (end - start + 1 > input.maxResponseBytes) throw new HttpRequestFailure('invalid_input', 'not_dispatched');
	const bytes = new Uint8Array(Math.max(0, end - start + 1));
	// Use the existing Artifact transfer batch; this splits transport without reducing file capacity.
	const batchBytes = 4 * 1024 * 1024;
	for (let offset = start; offset <= end; offset += batchBytes) {
		const endInclusive = Math.min(end, offset + batchBytes - 1);
		const result = await platform.sdk.request(
			{
				method: 'agent.artifacts.readRange',
				params: { artifactId, expectedVersion: original.version, start: offset, endInclusive },
			},
			input.signal,
		);
		if (
			result.method !== 'agent.artifacts.readRange' ||
			result.value.version !== original.version ||
			result.value.totalBytes !== original.sizeBytes
		)
			throw new HttpRequestFailure('protocol_failure', 'unknown');
		const chunk = Uint8Array.from(atob(result.value.dataBase64), (character) => character.charCodeAt(0));
		if (chunk.byteLength !== endInclusive - offset + 1) throw new HttpRequestFailure('protocol_failure', 'unknown');
		bytes.set(chunk, offset - start);
	}
	if (input.signal?.aborted) throw new HttpRequestFailure('cancelled', 'unknown');
	const headers = new Headers({
		'content-type': 'application/octet-stream',
		etag: '"' + original.version + '"',
		'content-length': String(bytes.byteLength),
	});
	if (parsed) headers.set('content-range', 'bytes ' + start + '-' + end + '/' + original.sizeBytes);
	return { status: parsed ? 206 : 200, headers, bytes };
}

export async function requestBinary(
	input: Parameters<typeof requestChatBinary>[0],
): ReturnType<typeof requestChatBinary> {
	try {
		return await requestChatBinary(input);
	} catch (cause) {
		throw toChatSdkFailure(cause);
	}
}
