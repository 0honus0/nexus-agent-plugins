import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

async function instances(context, contract) {
	const found = [];
	let cursor = null;
	do {
		const page = await context.directory.discover({ contract, apiVersion: 1, kind: 'service', cursor });
		for (const entry of page.entries) {
			{
				found.push({
					instanceId: entry.instanceId,
					summary: entry.summary,
					packageId: entry.package.packageId,
					version: entry.package.version,
				});
			}
		}
		cursor = page.nextCursor;
	} while (cursor !== null);
	return found;
}

/** Directory selection is independent from trusted connection settings. No Host MCP/ACP business operation exists. */
export async function executeIntegrations(name, input, _call, signal, serviceCall, context) {
	signal.throwIfAborted();
	if (name === 'acp_integration_list') {
		return { instances: await instances(context, 'nexus.protocol.acp.execute'), untrusted: true };
	}
	if (name === 'acp_execute') {
		return serviceCall({
			contract: 'nexus.protocol.acp.execute',
			instanceId: input.instanceId,
			argumentsJson: JSON.stringify({ prompt: input.prompt }),
		});
	}
	if (name === 'mcp_discover') {
		if (input.instanceId === null) {
			return { instances: await instances(context, 'nexus.protocol.mcp.discover'), untrusted: true };
		}
		return serviceCall({
			contract: 'nexus.protocol.mcp.discover',
			instanceId: input.instanceId,
			argumentsJson: JSON.stringify({ refresh: true }),
		});
	}
	const kind =
		name === 'mcp_tool' ? 'tool' : name === 'mcp_resource' ? 'resource' : name === 'mcp_prompt' ? 'prompt' : null;
	if (kind === null) {
		throw new AgentFailure('invalid_input');
	}
	return serviceCall({
		contract: 'nexus.protocol.mcp.invoke',
		instanceId: input.instanceId,
		argumentsJson: JSON.stringify({
			kind,
			name: input.name,
			argumentsJson: input.argumentsJson,
			schemaHash: input.schemaHash,
			continuation: input.continuation,
			resume:
				input.resume === null
					? null
					: { requestState: input.resume.requestState, inputResponsesJson: input.resume.inputResponsesJson },
		}),
	});
}
