import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';

export const EmptySchema = z.strictObject({});

const Base64Schema = z
	.string()
	.min(1)
	.max(32768)
	.regex(/^[a-zA-Z0-9_-]+$/u);

const ChallengeSchema = z.object({ challenge: Base64Schema });

const AttachmentSchema = z.enum(['platform', 'cross-platform']).optional();

const CredentialFields = {
	id: Base64Schema,
	rawId: Base64Schema,
	type: z.literal('public-key'),
	authenticatorAttachment: AttachmentSchema,
	clientExtensionResults: z.object({}),
};

export const PasskeyOriginSchema = z
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

export const PasskeyIdSchema = z.strictObject({ id: Base64Schema });

export const PasskeyNameSchema = z.string().trim().min(1).max(80);

export const PasskeySchema = z.strictObject({
	id: Base64Schema,
	name: PasskeyNameSchema,
	origin: PasskeyOriginSchema,
	createdAt: z.int().nonnegative(),
});

export type Passkey = z.infer<typeof PasskeySchema>;

export const PasskeyListSchema = z.strictObject({ items: z.array(PasskeySchema) });

export const PasskeyAuthenticationStartSchema = z.strictObject({ origin: PasskeyOriginSchema });

export const PasskeyRegistrationStartSchema = PasskeyAuthenticationStartSchema.extend({ name: PasskeyNameSchema });

export const PasskeyRegistrationOptionsSchema = z.strictObject({
	transaction: z.uuid(),
	options: z.custom<PublicKeyCredentialCreationOptionsJSON>((value) => ChallengeSchema.safeParse(value).success),
});

export const PasskeyAuthenticationOptionsSchema = z.strictObject({
	options: z.custom<PublicKeyCredentialRequestOptionsJSON>((value) => ChallengeSchema.safeParse(value).success),
});

export const PasskeyRegistrationFinishSchema = z.strictObject({
	transaction: z.uuid(),
	credential: z.strictObject({
		...CredentialFields,
		response: z.strictObject({
			clientDataJSON: Base64Schema,
			attestationObject: Base64Schema,
			authenticatorData: Base64Schema.optional(),
			transports: z.array(z.string().max(32)).max(16).optional(),
			publicKeyAlgorithm: z.number().int().optional(),
			publicKey: Base64Schema.optional(),
		}),
	}) satisfies z.ZodType<RegistrationResponseJSON>,
});

export const PasskeyAuthenticationFinishSchema = z.strictObject({
	credential: z.strictObject({
		...CredentialFields,
		response: z.strictObject({
			clientDataJSON: Base64Schema,
			authenticatorData: Base64Schema,
			signature: Base64Schema,
			userHandle: Base64Schema.optional(),
		}),
	}) satisfies z.ZodType<AuthenticationResponseJSON>,
});
