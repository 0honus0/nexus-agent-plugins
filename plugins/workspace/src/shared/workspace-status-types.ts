import { z } from 'zod';
import { ErrorDetailSchema } from './workspace-diagnostic-types.js';
import { ServerStatusSchema } from '@nexus-terminal/remote-tools/remote-tools-types';

export { ServerStatusSchema, type ServerStatus } from '@nexus-terminal/remote-tools/remote-tools-types';

export const StatusEventSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('sample'), sample: ServerStatusSchema }),
	z.object({ type: z.literal('error'), error: ErrorDetailSchema }),
]);

export type StatusEvent = z.infer<typeof StatusEventSchema>;
