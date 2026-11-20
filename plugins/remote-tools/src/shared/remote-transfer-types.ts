import { z } from 'zod';

const AuthenticationSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('password'), password: z.string() }),
	z.object({ type: z.literal('key'), privateKey: z.string(), passphrase: z.string().nullable().optional() }),
]);

/** Backend only: direct copying temporarily delegates target credentials to the trusted source.
 * Use a host key from an already verified connection. Never send this input to UI/logs.
 */
export const RemoteTransferTargetSchema = z.object({
	host: z
		.string()
		.min(1)
		.max(253)
		.refine((value) => /^[a-zA-Z0-9.:[\]_-]+$/.test(value)),
	port: z.number().int().min(1).max(65535),
	username: z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/),
	hostKey: z.instanceof(Uint8Array),
	fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
	authentication: AuthenticationSchema,
});

export type RemoteTransferTarget = z.infer<typeof RemoteTransferTargetSchema>;

export const RemoteTransferInputSchema = z.object({
	paths: z
		.array(
			z
				.string()
				.startsWith('/')
				.refine((value) => !value.includes('\0')),
		)
		.min(1)
		.max(256),
	destination: z
		.string()
		.startsWith('/')
		.refine((value) => !value.includes('\0')),
	target: RemoteTransferTargetSchema.optional(),
	filesOnly: z.boolean().default(false),
});

export type RemoteTransferInput = z.infer<typeof RemoteTransferInputSchema>;

export const RemoteTransferMethodSchema = z.enum(['rsync', 'scp', 'local']);

export type RemoteTransferMethod = z.infer<typeof RemoteTransferMethodSchema>;

export const RemoteTransferResultSchema = z.discriminatedUnion('state', [
	z.object({ state: z.literal('copied'), method: RemoteTransferMethodSchema }),
	z.object({ state: z.literal('unavailable'), reason: z.enum(['tools', 'unreachable', 'unsupported']) }),
]);

export type RemoteTransferResult = z.infer<typeof RemoteTransferResultSchema>;
