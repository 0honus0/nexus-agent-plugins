import { definePlugin } from '../../../sdk/backend-v4.mjs';
import { run } from './run.mjs';

export default definePlugin((plugin) => {
	plugin.register(
		{
			kind: 'app',
			key: 'nexus.agent.run',
			contract: 'nexus.app',
			apiVersion: 1,
			summary: 'Nexus Agent',
			instructions: 'Complete the authorized task with the selected model and plugin capabilities.',
			inputSchemaJson: JSON.stringify({
				type: 'object',
				required: ['model', 'artifacts'],
				properties: {
					model: {
						type: 'object',
						required: ['providerId', 'modelId', 'configurationVersion', 'reasoningEffort'],
						properties: {
							providerId: { type: 'string' },
							modelId: { type: 'string' },
							configurationVersion: { type: 'integer', minimum: 1 },
							reasoningEffort: { type: ['string', 'null'] },
						},
						additionalProperties: false,
					},
					artifacts: {
						type: 'array',
						items: {
							type: 'object',
							required: ['id', 'name', 'version', 'sha256', 'mediaType', 'sizeBytes'],
							properties: {
								id: { type: 'string' },
								name: { type: 'string' },
								version: { type: 'integer', minimum: 1 },
								sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
								mediaType: { type: 'string' },
								sizeBytes: { type: 'integer', minimum: 0 },
							},
							additionalProperties: false,
						},
					},
				},
				additionalProperties: false,
			}),
			resultSchemaJson: JSON.stringify({
				type: 'object',
				required: ['kind', 'outputs'],
				properties: {
					kind: { const: 'complete' },
					outputs: {
						type: 'array',
						items: {
							type: 'object',
							required: ['id', 'sha256', 'sizeBytes', 'mediaType'],
							properties: {
								id: { type: 'string' },
								sha256: { type: 'string' },
								sizeBytes: { type: 'integer', minimum: 0 },
								mediaType: { type: 'string' },
							},
							additionalProperties: false,
						},
					},
				},
				additionalProperties: false,
			}),
			capabilities: ['plugin.invoke'],
			tags: [],
			execution: 'managed',
		},
		run,
	);
});
