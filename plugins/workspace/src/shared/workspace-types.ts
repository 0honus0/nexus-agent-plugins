import { z } from 'zod';
import { WorkspaceSessionPresentationSchema } from './workspace-layout-types';

export const SessionCreateSchema = z.strictObject({
	connectionId: z.uuid(),
	hostKeyFingerprint: z
		.string()
		.regex(/^SHA256:[A-Za-z0-9+/]{43}$/)
		.optional(),
});

export const SessionSchema = z.object({
	id: z.uuid(),
	connectionId: z.uuid(),
	name: z.string(),
	state: z.enum(['attached', 'suspended', 'disconnected']),
	createdAt: z.number(),
	terminal: z.enum(['running', 'closed']),
	transfers: z.number().int().nonnegative(),
	presentation: WorkspaceSessionPresentationSchema.optional(),
});

export const SessionListResponseSchema = z.object({ items: z.array(SessionSchema) });

export type SessionInfo = z.infer<typeof SessionSchema>;

export const TerminalInputSchema = z.discriminatedUnion('type', [
	z.strictObject({ type: z.literal('input'), data: z.string().max(32768) }),
	z.strictObject({
		type: z.literal('resize'),
		cols: z.number().int().min(2).max(500),
		rows: z.number().int().min(1).max(200),
	}),
	z.strictObject({ type: z.literal('close') }),
]);

/** Server text frames contain control messages; continuous output is UTF-8 binary. */
export const TerminalControlSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('snapshot'),
		data: z.string(),
		cols: z.number(),
		rows: z.number(),
		closed: z.boolean(),
	}),
	z.object({ type: z.literal('closed') }),
]);

export const SessionCreateResultSchema = z.strictObject({
	result: z.discriminatedUnion('state', [
		z.strictObject({ state: z.literal('created'), session: SessionSchema }),
		z.strictObject({
			state: z.literal('confirm-host'),
			fingerprint: z.string(),
			previousFingerprint: z.string().optional(),
		}),
	]),
});

export type SessionCreate = z.infer<typeof SessionCreateSchema>;

export const WorkspaceSessionsTopic = 'sessions';
