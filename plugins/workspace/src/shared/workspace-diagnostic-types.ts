import { z } from 'zod';

/** Raw machine identifiers only. Never serialize upstream message, stack, config or arbitrary properties. */
export const ErrorCodeSchema = z.union([
	z
		.string()
		.min(1)
		.max(160)
		.regex(/^[a-zA-Z0-9_.:-]+$/),
	z.number().int().safe(),
]);

export const ErrorDetailSchema = z.object({
	source: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-zA-Z0-9_.:-]+$/),
	operation: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-zA-Z0-9_.:-]+$/),
	code: ErrorCodeSchema,
	level: z
		.string()
		.min(1)
		.max(100)
		.regex(/^[a-zA-Z0-9_.:-]+$/)
		.optional(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
