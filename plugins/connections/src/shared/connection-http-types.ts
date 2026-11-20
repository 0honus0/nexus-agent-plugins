import { z } from 'zod';
import { ConnectionCatalogSchema, ConnectionInputSchema, ConnectionsRevisionSchema } from './connection-types.js';

export const ConnectionCatalogResponseSchema = ConnectionCatalogSchema.extend({
	revision: ConnectionsRevisionSchema.shape.revision.optional(),
});

export const ConnectionIdSchema = z.strictObject({ id: z.uuid() });

export const ConnectionWriteSchema = z.strictObject({ connection: ConnectionInputSchema });

export const ConnectionUpdateSchema = ConnectionIdSchema.extend(ConnectionWriteSchema.shape);
