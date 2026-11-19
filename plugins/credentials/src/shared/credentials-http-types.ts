import { z } from 'zod';
import { CredentialInputSchema, CredentialPatchSchema } from './credentials-types.js';

export const CredentialIdSchema = z.strictObject({ id: z.uuid() });

export const CredentialCreateSchema = z.strictObject({ credential: CredentialInputSchema });

export const CredentialUpdateSchema = CredentialIdSchema.extend({ patch: CredentialPatchSchema });
