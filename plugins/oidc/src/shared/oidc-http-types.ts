import { z } from 'zod';

export const EmptySchema = z.strictObject({});

export const OidcOriginSchema = z
	.string()
	.max(512)
	.refine((value) => {
		const url = URL.parse(value);
		return (
			url?.origin === value &&
			(url.protocol === 'https:' ||
				(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
		);
	});

export const OidcHttpsUrlSchema = z
	.string()
	.max(2048)
	.refine((value) => {
		const url = URL.parse(value);
		return url?.protocol === 'https:' && !url.username && !url.password && !url.hash;
	});

export const OidcAuthMethodSchema = z.enum(['client_secret_basic', 'client_secret_post', 'none']);

export const OidcConfigSchema = z.strictObject({
	issuer: OidcHttpsUrlSchema.refine((value) => !new URL(value).search),
	clientId: z.string().trim().min(1).max(255),
	subject: z
		.string()
		.min(1)
		.max(255)
		.regex(/^[\x20-\x7E]+$/u),
	origin: OidcOriginSchema,
	authMethod: OidcAuthMethodSchema,
});

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

export const OidcConfigInputSchema = OidcConfigSchema.extend({
	clientSecret: z.string().max(4096).optional(),
});

export type OidcConfigInput = z.infer<typeof OidcConfigInputSchema>;

export const OidcStatusSchema = z.strictObject({
	config: OidcConfigSchema.nullable(),
	callbackPath: z.string().startsWith('/api/auth/plugins/'),
});

export const OidcStartSchema = z.strictObject({ origin: OidcOriginSchema });

export const OidcAuthorizationSchema = z.strictObject({ authorizationUrl: OidcHttpsUrlSchema });
