import { definePlugin } from '../../sdk/backend-v4.mjs';
import { ServiceFailure, encoded } from './failure.mjs';

export const contentResultSchema = {
	type: 'object',
	required: ['content'],
	properties: {
		content: {
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
	additionalProperties: false,
};

/** Protocol contracts are provider-owned registrations; Host only supplies scoped I/O. */
export function createServiceRuntime({ contract, methods, perform, prepare }) {
	return definePlugin((plugin) => {
		if (prepare) {
			plugin.onReady(prepare);
		}
		for (const method of methods) {
			plugin.register(
				{
					kind: 'service',
					key: plugin.identity.package.packageId + '.' + method.name,
					contract: contract + '.' + method.name,
					apiVersion: 1,
					summary: method.summary,
					instructions: method.instructions,
					inputSchemaJson: JSON.stringify(method.inputSchema),
					resultSchemaJson: JSON.stringify(contentResultSchema),
					capabilities: [],
					tags: [],
					execution: 'managed',
				},
				async (input, context) => {
					let value;
					try {
						value = await perform(method.name, input, context);
					} catch (error) {
						if (!(error instanceof ServiceFailure)) {
							throw error;
						}
						value = { failure: { code: error.code } };
					}
					return {
						content: await context.content.put(
							'result',
							encoded(value, Number.MAX_SAFE_INTEGER),
							'application/json',
						),
					};
				},
			);
		}
	});
}
