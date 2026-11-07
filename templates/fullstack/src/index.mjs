import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { definePlugin, PluginCapabilityFailure } from '../../../sdk/backend-v4.mjs';

function assertDenied(probe, permission) {
	try {
		probe();
	} catch (error) {
		if (error?.code === 'ERR_ACCESS_DENIED' && error.permission === permission) {
			return true;
		}
		throw error;
	}
	throw new Error('FULLSTACK_PERMISSION_NOT_ENFORCED:' + permission);
}

export default definePlugin((plugin) => {
	const status = {
		state: 'active',
		source: 'backend',
		protocolVersion: plugin.identity.protocol,
		fileReadDenied: assertDenied(() => fs.readFileSync('/etc/passwd', 'utf8'), 'FileSystemRead'),
		childProcessDenied: assertDenied(() => spawnSync(process.execPath, ['--version']), 'ChildProcess'),
	};
	plugin.register(
		{
			kind: 'app',
			key: 'nexus.fullstack.run',
			contract: 'nexus.app',
			apiVersion: 1,
			summary: 'Full-stack SDK example',
			instructions: 'Record private instance status on an explicit user Run. No model or remote task.',
			inputSchemaJson: '{"type":"object","properties":{},"additionalProperties":false}',
			resultSchemaJson:
				'{"type":"object","required":["kind","outputs"],"properties":{"kind":{"const":"complete"},"outputs":{"type":"array"}},"additionalProperties":false}',
			capabilities: ['plugin.invoke'],
			tags: [],
			execution: 'managed',
		},
		async (_input, context) => {
			const current = await context.storage.read('example.v1', 'backend.status');
			const receipt = await context.storage.write({
				operationKey: 'status',
				namespace: 'example.v1',
				key: 'backend.status',
				expectedRevision: current?.revision ?? 0,
				documentJson: JSON.stringify(status),
			});
			if (receipt.kind !== 'completed') {
				throw new PluginCapabilityFailure(receipt.kind === 'rejected' ? receipt.code : 'operation_unknown');
			}
			const body = JSON.stringify(status);
			await context.run.append({ key: 'status', index: 0, text: body });
			return { kind: 'complete', outputs: [await context.content.put('status', body, 'application/json')] };
		},
	);
});
