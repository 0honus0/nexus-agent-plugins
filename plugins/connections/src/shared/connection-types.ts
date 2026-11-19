import { z } from 'zod';

export const ConnectionTypeSchema = z.enum(['ssh', 'rdp', 'vnc']);

export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export const connectionDefaults: Record<ConnectionType, { port: number; username: boolean; domain: boolean }> = {
	ssh: { port: 22, username: true, domain: false },
	rdp: { port: 3389, username: true, domain: true },
	vnc: { port: 5900, username: false, domain: false },
};

export const TagNameSchema = z.string().trim().min(1).max(40);

export const ConnectionInputSchema = z
	.strictObject({
		name: z.string().trim().min(1).max(120),
		type: ConnectionTypeSchema,
		host: z
			.string()
			.trim()
			.min(1)
			.max(253)
			.refine((value) => !/[\s/\\?#@]/u.test(value), 'CONNECTION_HOST_INVALID'),
		port: z.number().int().min(1).max(65535),
		credentialId: z.uuid().nullable().default(null),
		username: z.string().trim().max(120).default(''),
		domain: z.string().trim().max(120).default(''),
		notes: z.string().max(2000).default(''),
		tags: z.array(TagNameSchema).max(20).default([]),
	})
	.superRefine((value, ctx) => {
		if (value.type !== 'rdp' && value.domain)
			ctx.addIssue({ code: 'custom', path: ['domain'], message: 'CONNECTION_DOMAIN_INVALID' });
		if (value.type === 'vnc' && value.username)
			ctx.addIssue({ code: 'custom', path: ['username'], message: 'CONNECTION_USERNAME_INVALID' });
	});

export type ConnectionInput = z.infer<typeof ConnectionInputSchema>;

export const ConnectionSchema = z.object({
	id: z.uuid(),
	...ConnectionInputSchema.shape,
	createdAt: z.number().int(),
	updatedAt: z.number().int(),
});

export type Connection = z.infer<typeof ConnectionSchema>;

export const TagSchema = z.object({
	id: z.uuid(),
	name: TagNameSchema,
	count: z.number().int().nonnegative(),
});

export type Tag = z.infer<typeof TagSchema>;

export const ConnectionCatalogSchema = z.object({
	connections: z.array(ConnectionSchema),
	tags: z.array(TagSchema),
});

export type ConnectionCatalog = z.infer<typeof ConnectionCatalogSchema>;

export const ConnectionsRevisionSchema = z.strictObject({ revision: z.int().nonnegative() });

export const ConnectionEditorRequestSchema = z.strictObject({
	connectionId: z.uuid(),
	reason: z.enum(['credential-required']).optional(),
});

export type ConnectionEditorRequest = z.infer<typeof ConnectionEditorRequestSchema>;
