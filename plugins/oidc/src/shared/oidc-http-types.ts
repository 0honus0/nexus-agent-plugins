import { z } from 'zod';

export const EmptySchema = z.strictObject({});

export const oidcBindingCallbackPath = '/login/oidc/callback';

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

export const OidcSubjectSchema = z
	.string()
	.min(1)
	.max(255)
	.regex(/^[\x20-\x7E]+$/u);

export const OidcConfigSchema = z.strictObject({
	issuer: OidcHttpsUrlSchema.refine((value) => URL.parse(value)?.search === ''),
	clientId: z.string().trim().min(1).max(255),
	subject: OidcSubjectSchema,
	origin: OidcOriginSchema,
	authMethod: OidcAuthMethodSchema,
});

export type OidcConfig = z.infer<typeof OidcConfigSchema>;

export const OidcConfigInputSchema = OidcConfigSchema.extend({
	clientSecret: z.string().max(4096).optional(),
});

export type OidcConfigInput = z.infer<typeof OidcConfigInputSchema>;

export const OidcBindingInputSchema = OidcConfigInputSchema.omit({ subject: true });

export type OidcBindingInput = z.infer<typeof OidcBindingInputSchema>;

export const OidcStatusSchema = z.strictObject({
	config: OidcConfigSchema.nullable(),
	callbackPath: z.string().startsWith('/api/auth/plugins/'),
});

export const OidcStartSchema = z.strictObject({ origin: OidcOriginSchema });

export const OidcAuthorizationSchema = z.strictObject({ authorizationUrl: OidcHttpsUrlSchema });

export const OidcBindingAuthorizationSchema = OidcAuthorizationSchema.extend({ transaction: z.uuid() });

export const OidcBindingFinishSchema = z.strictObject({ transaction: z.uuid(), query: z.string().max(8192) });
