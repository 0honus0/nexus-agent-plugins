import { z } from 'zod';

export const privateKeyLimit = 64 * 1024;

const key = z
	.string()
	.min(1)
	.max(privateKeyLimit)
	.refine((v) => new TextEncoder().encode(v).length <= privateKeyLimit);

const common = {
	name: z.string().trim().min(1).max(120),
	username: z.string().trim().min(1).max(120),
};

export const CredentialInputSchema = z.discriminatedUnion('type', [
	z.strictObject({
		...common,
		type: z.literal('password'),
		password: z.string().min(1).max(16384),
	}),
	z.strictObject({
		...common,
		type: z.literal('privateKey'),
		privateKey: key,
		passphrase: z.string().max(1024).nullable().optional(),
	}),
]);

export const CredentialPatchSchema = z
	.strictObject({
		name: common.name.optional(),
		username: common.username.optional(),
		type: z.enum(['password', 'privateKey']).optional(),
		password: z.string().min(1).max(16384).optional(),
		privateKey: key.optional(),
		passphrase: z.string().max(1024).nullable().optional(),
	})
	.refine((v) => Object.keys(v).length > 0);

export const CredentialSchema = z.strictObject({
	id: z.uuid(),
	...common,
	type: z.enum(['password', 'privateKey']),
	hasPassphrase: z.boolean(),
	createdAt: z.number(),
	updatedAt: z.number(),
});

export const CredentialsSnapshotSchema = z.object({
	revision: z.number().int().nonnegative(),
	items: z.array(CredentialSchema),
});

export const CredentialsRevisionSchema = z.strictObject({ revision: z.int().nonnegative() });

export type Credential = z.infer<typeof CredentialSchema>;

export type CredentialInput = z.infer<typeof CredentialInputSchema>;

export type CredentialPatch = z.infer<typeof CredentialPatchSchema>;

export type CredentialsSnapshot = z.infer<typeof CredentialsSnapshotSchema>;

/** Backend only: never return from an HTTP handler, WS message, diagnostic or frontend service. */
export type CredentialMaterial = CredentialInput;
