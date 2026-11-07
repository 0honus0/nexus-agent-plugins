import { randomUUID } from 'node:crypto';
import { createServiceRuntime } from '../../../lib/services/runtime.mjs';
import { ServiceFailure, encoded, record, objectJson, collectFailures } from '../../../lib/services/failure.mjs';
import { methods } from './contracts.mjs';
import { ManagedMcpHttp } from './http.mjs';
import { McpProtocolSession } from './protocol.mjs';
import { catalogHash, publishInventory } from './inventory.mjs';

const runs = new Map();

async function stateFor(context) {
	if (context.scope.kind !== 'run') {
		throw new ServiceFailure('invalid_input');
	}
	const runId = context.scope.runId;
	let state = runs.get(runId);
	if (state === undefined) {
		state = {
			opening: null,
			protocol: null,
			leaseId: null,
			session: null,
			lane: Promise.resolve(),
			continuations: new Map(),
		};
		runs.set(runId, state);
		context.onResourcesDispose('mcp.session', async () => {
			await state.lane;
			try {
				await state.protocol?.dispose();
			} finally {
				state.continuations.clear();
				runs.delete(runId);
			}
		});
		state.opening = Promise.resolve().then(async () => {
			const settings = await context.configuration.read();
			const options = objectJson(
				settings.configuration.revision
					? settings.configuration.documentJson
					: (settings.settings?.defaultsJson ?? '{}'),
			);
			if (Object.keys(options).some((key) => key !== 'protocolVersion')) {
				throw new ServiceFailure('invalid_input');
			}
			state.protocol = new McpProtocolSession({
				protocolVersion: options.protocolVersion ?? '2026-07-28',
				client: { name: 'nexus.services.mcp', version: '4.0.0' },
			});
			state.session = await context.transport.open('mcp:' + runId + ':' + randomUUID());
			if (state.session.transport.kind !== 'http') {
				throw new ServiceFailure('invalid_input');
			}
			const opened = await context.transport.call(state.session.sessionId, {
				method: 'transport.http.open',
				params: { grant: state.session.transport.grant },
			});
			state.leaseId = opened.value.leaseId;
		});
		// Keep a failed original opening: a new caller must not invent another key after uncertain dispatch.
		void state.opening.catch(() => undefined);
	}
	await state.opening;
	return state;
}

async function perform(method, input, context) {
	const args = record(input);
	const state = await stateFor(context);
	const task = state.lane.then(async () => {
		context.signal.throwIfAborted();

		const call = async (name, params) =>
			(await context.transport.call(state.session.sessionId, { method: name, params })).value;

		// Rebind to THIS handler. No saved request closure from an earlier invocation is executable.
		const io = new ManagedMcpHttp(call, state.leaseId, context.signal, () =>
			context.transport.close(state.session.sessionId),
		);
		let primary = null;
		try {
			const requestIdentity =
				method === 'invoke'
					? encoded({
							kind: args.kind,
							name: args.name,
							argumentsJson: args.argumentsJson,
							schemaHash: args.schemaHash,
						})
					: null;
			if (method === 'invoke') {
				if (args.continuation === null) {
					if (args.resume !== null) {
						throw new ServiceFailure('invalid_input');
					}
				} else {
					const original = state.continuations.get(args.continuation);
					if (
						!original ||
						original.requestIdentity !== requestIdentity ||
						args.resume === null ||
						original.requestState !== args.resume.requestState
					) {
						throw new ServiceFailure('invalid_input');
					}
					state.continuations.delete(args.continuation);
				}
			}
			await state.protocol.attach(io.fetch, context.signal);
			const catalog = await state.protocol.discover(context.signal, method === 'discover' ? args.refresh : true);
			const schemaHash = catalogHash(catalog);
			await publishInventory(context, catalog, perform);
			if (method === 'discover') {
				return { catalog, schemaHash };
			}
			const found =
				args.kind === 'tool'
					? catalog.tools.some((item) => item.name === args.name)
					: args.kind === 'resource'
						? catalog.resources.some((item) => item.uri === args.name)
						: catalog.prompts.some((item) => item.name === args.name);
			if (schemaHash !== args.schemaHash || !found) {
				throw new ServiceFailure('invalid_input');
			}
			const value = await state.protocol.invoke(args, context.signal);
			if (value.kind === 'input_required') {
				const continuation = randomUUID();
				state.continuations.set(continuation, { requestIdentity, requestState: value.requestState });
				return {
					kind: value.kind,
					requestState: value.requestState,
					inputRequestsJson: value.inputRequestsJson,
					continuation,
				};
			}
			return { kind: value.kind, resultJson: value.resultJson, continuation: null };
		} catch (error) {
			primary = error;
			throw error;
		} finally {
			const sessionClosed = context.signal.aborted
				? await Promise.allSettled([context.transport.close(state.session.sessionId)])
				: [];
			const detached = await Promise.allSettled([state.protocol.detach()]);
			const closed = await Promise.allSettled([io.close(false)]);
			collectFailures([...sessionClosed, ...detached, ...closed], primary, 'MCP invocation cleanup failed');
		}
	});
	state.lane = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}

/** Metadata preparation has its own original Host instance scope, never a synthetic user Run. */
async function prepare(context) {
	const settings = await context.configuration.read();
	const options = objectJson(
		settings.configuration.revision
			? settings.configuration.documentJson
			: (settings.settings?.defaultsJson ?? '{}'),
	);
	if (Object.keys(options).some((key) => key !== 'protocolVersion')) {
		throw new ServiceFailure('invalid_input');
	}
	const protocol = new McpProtocolSession({
		protocolVersion: options.protocolVersion ?? '2026-07-28',
		client: { name: 'nexus.services.mcp', version: '4.0.0' },
	});
	let session = null;
	let io = null;
	let primary = null;
	try {
		session = await context.transport.open('mcp.inventory');
		if (session.transport.kind !== 'http') {
			throw new ServiceFailure('invalid_input');
		}

		const call = async (name, params) =>
			(await context.transport.call(session.sessionId, { method: name, params })).value;

		io = await ManagedMcpHttp.open(call, session.transport.grant, context.signal, () =>
			context.transport.close(session.sessionId),
		);
		await protocol.attach(io.fetch, context.signal);
		await publishInventory(context, await protocol.discover(context.signal, true), perform);
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		const outcomes = [];
		// DELETE must use this still-live lifecycle callback, before closing its fixed byte lease.
		if (!context.signal.aborted) {
			outcomes.push(...(await Promise.allSettled([protocol.terminate()])));
		}
		outcomes.push(...(await Promise.allSettled([protocol.dispose()])));
		if (io !== null) {
			outcomes.push(...(await Promise.allSettled([io.close(false)])));
		}
		if (session !== null) {
			outcomes.push(...(await Promise.allSettled([context.transport.close(session.sessionId)])));
		}
		collectFailures(outcomes, primary, 'MCP inventory cleanup failed');
	}
}

export default createServiceRuntime({ contract: 'nexus.protocol.mcp', methods, perform, prepare });
