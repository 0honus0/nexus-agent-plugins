import { readAgentPluginContentReference } from '@nexus-terminal/shared/agent/plugins/content';
import { definePlugin, PluginCapabilityFailure } from '../../sdk/backend-v4.mjs';
import { AgentFailure } from './failure.mjs';

/** Refusals are typed. Unknown effects remain attached to the original Host operation. */
export class HostOperationFailure extends Error {
	constructor(code) {
		super(`Host operation: ${code}`);
		this.code = code;
	}
}

/** Each package owns its descriptions and algorithms; the public SDK owns lifecycle and wire decoding. */
export function createToolRuntime({ definitions, decode, perform }) {
	return definePlugin((plugin) => {
		for (const definition of definitions) {
			plugin.register(definition, async (argumentsValue, context) => {
				const name = definition.key.slice(plugin.identity.package.packageId.length + 1);
				let nextEffect = 0;

				const call = async (request) => {
					context.signal.throwIfAborted();
					const result = await context.perform(`effect:${nextEffect++}`, request);
					return result.value;
				};

				const serviceCall = async ({ contract, apiVersion = 1, instanceId, key, argumentsJson }) => {
					let cursor = null;
					const candidates = [];
					do {
						const page = await context.directory.discover({
							contract,
							apiVersion,
							kind: 'service',
							cursor,
						});
						candidates.push(
							...page.entries.filter(
								(entry) =>
									(key === undefined || entry.key === key) &&
									(instanceId === undefined || entry.instanceId === instanceId),
							),
						);
						cursor = page.nextCursor;
					} while (cursor !== null);
					if (candidates.length !== 1) {
						throw new HostOperationFailure(candidates.length ? 'version_conflict' : 'provider_unavailable');
					}
					const binding = await context.directory.bind(candidates[0].id);
					const result = await context.directory.invoke({
						bindingId: binding.id,
						operationKey: `service:${nextEffect++}`,
						argumentsJson,
					});
					if (result.kind !== 'completed') {
						throw new HostOperationFailure(result.kind === 'rejected' ? result.code : 'operation_unknown');
					}
					const response = JSON.parse(result.resultJson);
					if (
						response !== null &&
						typeof response === 'object' &&
						!Array.isArray(response) &&
						Object.keys(response).length === 1 &&
						Object.hasOwn(response, 'content')
					) {
						return JSON.parse(
							await context.content.text(readAgentPluginContentReference(response.content)),
						);
					}
					return response;
				};

				let value;
				try {
					const input = decode(name, JSON.stringify(argumentsValue));
					value = await perform(name, input, call, context.signal, serviceCall, context);
				} catch (error) {
					if (!(error instanceof AgentFailure)) {
						throw error;
					}
					throw new PluginCapabilityFailure(error.code);
				}
				const text = JSON.stringify(value);
				if (text === undefined) {
					throw new AgentFailure('invalid_input');
				}
				return { content: await context.content.put('result', text, 'application/json') };
			});
		}
	});
}
