import { z } from 'zod';

const quantity = z.number().finite().nonnegative().optional();

const percent = z.number().finite().min(0).max(100).optional();

/** Memory and disk use bytes; network rates use bytes/second. Missing samples stay absent, never zero-filled. */
export const ServerStatusSchema = z.object({
	timestamp: z.number().finite(),
	cpuPercent: percent,
	memPercent: percent,
	swapPercent: percent,
	diskPercent: percent,
	memUsed: quantity,
	memTotal: quantity,
	swapUsed: quantity,
	swapTotal: quantity,
	diskUsed: quantity,
	diskTotal: quantity,
	netRxRate: quantity,
	netTxRate: quantity,
	osName: z.string().max(512).optional(),
	cpuModel: z.string().max(512).optional(),
	netInterface: z.string().max(128).optional(),
	loadAvg: z.array(z.number().finite().nonnegative()).length(3).optional(),
});

export type ServerStatus = z.infer<typeof ServerStatusSchema>;

const argument = z
	.string()
	.max(32768)
	.refine((value) => !value.includes('\0'));

export const RemoteCommandSchema = z.object({
	executable: argument.min(1),
	args: z.array(argument).max(4096).default([]),
	cwd: argument.refine((value) => value.startsWith('/')).optional(),
	timeoutMs: z.number().int().min(1).max(3600000).nullable().default(15000),
	maxOutputBytes: z
		.number()
		.int()
		.min(1)
		.max(16 * 1024 * 1024)
		.default(1024 * 1024),
});

export type RemoteCommand = z.input<typeof RemoteCommandSchema>;

export const RemoteCommandResultSchema = z.object({
	stdout: z.string(),
	stderr: z.string(),
	code: z.number().int().nullable(),
	signal: z.string().optional(),
});

export type RemoteCommandResult = z.infer<typeof RemoteCommandResultSchema>;

export const RemoteToolNameSchema = z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_+.-]{0,99}$/);

export const RemoteEnvironmentSchema = z.object({
	kernel: z.string().max(100),
	platform: z.enum(['linux', 'unsupported']),
	tools: z.array(z.object({ name: RemoteToolNameSchema, available: z.boolean() })).max(100),
});

export type RemoteEnvironment = z.infer<typeof RemoteEnvironmentSchema>;

export {
	RemoteToolsErrorCodeSchema as RemoteToolsErrorCodeSchema,
	RemoteToolsErrorCode as RemoteToolsErrorCode,
} from './remote-tools-error-types.js';
