import { z } from 'zod';

export const EmptySchema = z.strictObject({});

export const RevisionSchema = z.strictObject({ revision: z.int().positive() });

export type Revision = z.infer<typeof RevisionSchema>;

export const ProviderOutputSchema = z.strictObject({ value: z.string() });

export const TestCryptoSchema = z.strictObject({
	local: z.boolean(),
	password: z.boolean(),
	options: z.string(),
	envelope: z.string(),
	authentication: z.string(),
});

declare module 'nexus-terminal/node' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/test-provider': { readonly fixture: { read(): string } };
	}
}

declare module 'nexus-terminal/browser' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/test-provider': { readonly fixture: { read(): string } };
	}
}
