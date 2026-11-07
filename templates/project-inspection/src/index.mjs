import { definePlugin, PluginCapabilityFailure } from '../../../sdk/backend-v4.mjs';

export default definePlugin((plugin) => {
	plugin.register(
		{
			kind: 'app',
			key: 'example.project-inspection.run',
			contract: 'nexus.app',
			apiVersion: 1,
			summary: 'Project inspection',
			instructions: 'Use a selected remote-tools provider to inspect a project, without a model.',
			inputSchemaJson:
				'{"type":"object","required":["connectionId","directory"],"properties":{"connectionId":{"type":"integer","minimum":1},"directory":{"type":"string"}},"additionalProperties":false}',
			resultSchemaJson:
				'{"type":"object","required":["kind","outputs"],"properties":{"kind":{"const":"complete"},"outputs":{"type":"array"}},"additionalProperties":false}',
			capabilities: ['plugin.invoke'],
			tags: [],
			execution: 'managed',
		},
		async (input, context) => {
			let cursor = null;
			const matches = [];
			do {
				const page = await context.directory.discover({
					kind: 'tool',
					contract: 'nexus.model-tool',
					apiVersion: 1,
					cursor,
				});
				matches.push(
					...page.entries.filter((entry) => entry.key === 'nexus.tools.remote.remote_project_inspect'),
				);
				cursor = page.nextCursor;
			} while (cursor !== null);
			if (matches.length !== 1) {
				throw new PluginCapabilityFailure(matches.length ? 'version_conflict' : 'provider_unavailable');
			}
			const binding = await context.directory.bind(matches[0].id);
			const result = await context.directory.invoke({
				bindingId: binding.id,
				operationKey: 'inspect',
				argumentsJson: JSON.stringify(input),
			});
			if (result.kind !== 'completed') {
				throw new PluginCapabilityFailure(result.kind === 'rejected' ? result.code : 'operation_unknown');
			}
			const body = JSON.parse(result.resultJson);
			const report = await context.content.text(body.content);
			let index = 0;
			for (let start = 0; start < report.length;) {
				let end = Math.min(start + 16384, report.length);
				if (end < report.length && /[\uD800-\uDBFF]/u.test(report[end - 1])) {
					end--;
				}
				await context.run.append({ key: 'report', index: index++, text: report.slice(start, end) });
				start = end;
			}
			return { kind: 'complete', outputs: [body.content] };
		},
	);
});
