import { z } from 'zod';
import { RemotePathSchema } from './workspace-file-types';

export const workspacePathHistoryLimit = 2_000;

export const WorkspacePathHistorySchema = z.object({
	paths: z.array(RemotePathSchema).max(workspacePathHistoryLimit),
});

export const WorkspacePathHistoryWriteSchema = z.strictObject({ path: RemotePathSchema });
