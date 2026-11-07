import { client, methods, ndJsonStream, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';
import { ServiceFailure, encoded, record, text, collectFailures } from '../../../lib/services/failure.mjs';

function requestKey(id) {
	if (
		!(typeof id === 'string' && id.length > 0 && Buffer.byteLength(id, 'utf8') <= 512) &&
		!(typeof id === 'number' && Number.isSafeInteger(id))
	) {
		throw new Error('ACP_REQUEST_ID_INVALID');
	}
	return JSON.stringify(id);
}

function stopReason(value) {
	if (!['end_turn', 'max_tokens', 'max_turn_requests', 'refusal', 'cancelled'].includes(value)) {
		throw new Error('ACP_STOP_REASON_INVALID');
	}
	return value;
}

/** Official SDK owns ACP parsing, serialization, schemas and request lifecycle. */
export async function executeAcpProtocol(io, input, signal) {
	const seen = new Set();
	const inbound = new Set();
	const permissionWrites = new Map();
	const handlers = new Set();
	const writes = new Set();
	const lifetime = new AbortController();
	let connection = null;
	let sessionId = null;
	let promptActive = false;
	let output = '';
	let outputBytes = 0;
	let primary = null;
	let inputClosed = false;

	function fail(error) {
		primary ??= error;
		lifetime.abort(error);
		connection?.close(error);
	}

	const rawOutput = new WritableStream({
		async write(bytes) {
			// ndJsonStream writes one complete SDK-serialized response per call, never partial JSON.
			const message = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
			const responseKey =
				Object.hasOwn(message, 'id') && !Object.hasOwn(message, 'method') ? requestKey(message.id) : null;
			const approval = responseKey === null ? undefined : permissionWrites.get(responseKey);
			if (approval !== undefined && encoded(message.result) !== approval.resultJson) {
				throw new Error('ACP_PERMISSION_RESPONSE_MISMATCH');
			}
			const task = io.write(bytes, approval?.grant ?? null);
			writes.add(task);
			try {
				await task;
				if (responseKey !== null) {
					permissionWrites.delete(responseKey);
					inbound.delete(responseKey);
				}
			} catch (error) {
				fail(error);
				throw error;
			} finally {
				writes.delete(task);
			}
		},
	});
	const rawInput = new ReadableStream(
		{
			async pull(controller) {
				try {
					const chunk = await io.read();
					if (!inputClosed && chunk.bytes.byteLength) {
						controller.enqueue(chunk.bytes);
					}
					if (!inputClosed && chunk.eof) {
						inputClosed = true;
						controller.close();
					}
				} catch (error) {
					if (!inputClosed) {
						controller.error(error);
					}
					fail(error);
				}
			},

			cancel() {
				inputClosed = true;
			},
		},
		{ highWaterMark: 0 },
	);
	const sdkStream = ndJsonStream(rawOutput, rawInput);
	const stream = {
		writable: sdkStream.writable,
		readable: sdkStream.readable.pipeThrough(
			new TransformStream({
				transform(message, controller) {
					if (Object.hasOwn(message, 'method') && Object.hasOwn(message, 'id')) {
						const key = requestKey(message.id);
						if (seen.has(key)) {
							throw new ServiceFailure('limit_exceeded');
						}
						seen.add(key);
						inbound.add(key);
					}
					controller.enqueue(message);
				},
			}),
		),
	};
	const app = client({ name: input.client.name });
	app.onRequest(methods.client.session.requestPermission, (context) => {
		const task = Promise.resolve().then(async () => {
			const params = context.params;
			if (!promptActive || sessionId === null || params.sessionId !== sessionId) {
				throw new Error('ACP_PERMISSION_SESSION_INVALID');
			}
			const key = requestKey(context.requestId);
			if (
				!params.options.length ||
				new Set(params.options.map((item) => item.optionId)).size !== params.options.length
			) {
				throw new Error('ACP_PERMISSION_OPTIONS_INVALID');
			}
			const options = params.options.map((item) => ({ id: text(item.optionId, 512), kind: item.kind }));
			if (!options.some((item) => item.kind === 'allow_once')) {
				return { outcome: { outcome: 'cancelled' } };
			}
			const tool = params.toolCall;
			const approval = await io.permission({
				sessionId,
				toolCallId: text(tool.toolCallId, 512),
				requestId: key,
				title: tool.title == null ? '' : text(tool.title),
				kind: tool.kind == null ? null : text(tool.kind),
				inputJson: encoded(tool.rawInput ?? null),
			});
			AbortSignal.any([signal, lifetime.signal, context.signal]).throwIfAborted();
			if (!promptActive) {
				throw new Error('ACP_PERMISSION_PROMPT_FINISHED');
			}
			const option = options.find((item) => item.kind === approval.decision);
			const result = {
				outcome: option ? { outcome: 'selected', optionId: option.id } : { outcome: 'cancelled' },
			};
			permissionWrites.set(key, { grant: approval.grant, resultJson: encoded(result) });
			return result;
		});
		handlers.add(task);
		void task.catch(fail).finally(() => handlers.delete(task));
		return task;
	});
	app.onRequest('*', () => {
		throw RequestError.methodNotFound('Direct capability unavailable');
	});
	app.onNotification(methods.client.session.update, ({ params }) => {
		try {
			if (sessionId === null || params.sessionId !== sessionId) {
				throw new Error('ACP_UPDATE_SESSION_INVALID');
			}
			if (params.update.sessionUpdate === 'agent_message_chunk' && params.update.content.type === 'text') {
				if (!promptActive) {
					throw new Error('ACP_UPDATE_PROMPT_INVALID');
				}
				const chunk = params.update.content.text;
				outputBytes += Buffer.byteLength(chunk, 'utf8');
				if (outputBytes > input.maxOutputBytes) {
					throw new ServiceFailure('limit_exceeded');
				}
				output += chunk;
			}
		} catch (error) {
			fail(error);
			throw error;
		}
	});

	const aborted = () => fail(signal.reason ?? new Error('ACP_CANCELLED'));

	signal.addEventListener('abort', aborted, { once: true });
	try {
		signal.throwIfAborted();
		connection = app.connect(stream);

		const request = (method, params) => connection.agent.request(method, params, { cancellationSignal: signal });

		const initialized = await request(methods.agent.initialize, {
			protocolVersion: PROTOCOL_VERSION,
			clientCapabilities: {},
			clientInfo: { name: input.client.name, version: input.client.version },
		});
		if (initialized.protocolVersion !== PROTOCOL_VERSION) {
			throw new Error('ACP_VERSION_MISMATCH');
		}
		const created = await request(methods.agent.session.new, { cwd: input.cwd, mcpServers: [] });
		sessionId = text(created.sessionId, 512);
		promptActive = true;
		const result = await request(methods.agent.session.prompt, {
			sessionId,
			prompt: [{ type: 'text', text: input.prompt }],
		});
		promptActive = false;
		lifetime.abort();
		await Promise.all(handlers);
		await Promise.all(writes);
		if (primary !== null) {
			throw primary;
		}
		if (permissionWrites.size > 0) {
			throw new Error('ACP_PERMISSION_DELIVERY_PENDING');
		}
		return { text: output, stopReason: stopReason(result.stopReason) };
	} catch (error) {
		primary ??= error;
		throw error;
	} finally {
		promptActive = false;
		signal.removeEventListener('abort', aborted);
		lifetime.abort();
		connection?.close();
		const cleanup = await Promise.allSettled([...handlers, ...writes]);
		collectFailures(cleanup, primary, 'ACP SDK callbacks or writes failed');
	}
}
