import { z } from 'zod';
import { WorkspacePreferencesSchema } from './workspace-catalog-types';

export const CatalogWriteSchema = z.strictObject({
	version: z.number().int().nonnegative(),
	value: z.unknown(),
});

export const CatalogDeleteSchema = z.strictObject({ version: z.number().int().positive() });

export const PreferencesWriteSchema = WorkspacePreferencesSchema.extend({
	version: z.number().int().nonnegative(),
});
