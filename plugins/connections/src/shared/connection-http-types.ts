import { z } from 'zod';
import { ConnectionInputSchema } from './connection-types.js';

export const ConnectionIdSchema = z.strictObject({ id: z.uuid() });

export const ConnectionWriteSchema = z.strictObject({ connection: ConnectionInputSchema });

export const ConnectionUpdateSchema = ConnectionIdSchema.extend(ConnectionWriteSchema.shape);
