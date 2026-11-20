import { z } from 'zod';
import { TerminalDisplaySchema } from './workspace-terminal-types';

const name = z.string().trim().min(1).max(120);

export const FavoriteInputSchema = z.strictObject({
	name,
	path: z
		.string()
		.min(1)
		.max(4096)
		.refine((value) => !value.includes('\0')),
});

export const CommandInputSchema = z.strictObject({
	name,
	command: z
		.string()
		.min(1)
		.max(32000)
		.refine((value) => !value.includes('\0')),
	tags: z
		.array(z.string().trim().min(1).max(40))
		.max(20)
		.transform((values) => [...new Set(values)]),
	variables: z.record(z.string().regex(/^[\w.-]{1,80}$/), z.string().max(4096)),
});

export const terminalColorKeys = [
	'background',
	'foreground',
	'cursor',
	'cursorAccent',
	'selectionBackground',
	'selectionForeground',
	'black',
	'red',
	'green',
	'yellow',
	'blue',
	'magenta',
	'cyan',
	'white',
	'brightBlack',
	'brightRed',
	'brightGreen',
	'brightYellow',
	'brightBlue',
	'brightMagenta',
	'brightCyan',
	'brightWhite',
] as const;

export const TerminalColorsSchema = z
	.partialRecord(z.enum(terminalColorKeys), z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i))
	.refine((value) => !!value.background && !!value.foreground);

export const ThemeInputSchema = z.strictObject({ name, colors: TerminalColorsSchema });

/** Accept current named themes and the plain xterm palettes exported by the original application. */
export const ThemeFileEntrySchema = z.union([
	ThemeInputSchema,
	TerminalColorsSchema.transform((colors) => ({ name: undefined, colors })),
]);

export const ThemeFileSchema = z
	.union([ThemeFileEntrySchema, z.array(ThemeFileEntrySchema).min(1).max(50)])
	.transform((value) => (Array.isArray(value) ? value : [value]));

export const LocalEchoModeSchema = z.enum(['off', 'auto', 'on']);

export type LocalEchoMode = z.infer<typeof LocalEchoModeSchema>;

export const WorkspacePreferencesSchema = z.strictObject({
	/** null selects the built-in terminal palette; host UI mode never selects terminal colors. */
	theme: z.string().min(1).max(120).nullable(),
	/** Auto predicts only after observing slow remote echoes; never predicts composition candidates. */
	localEcho: LocalEchoModeSchema.default('auto'),
	/** Applies to file, folder and batch deletion from menus or keyboard shortcuts. Old records stay protected. */
	confirmFileDeletion: z.boolean().default(true),
	/** Applies only to Workspace terminals, including future connections. */
	display: TerminalDisplaySchema.prefault({}),
});

const meta = { id: z.uuid(), version: z.number().int().positive() };

export const FavoriteSchema = FavoriteInputSchema.extend(meta);

export const CommandSchema = CommandInputSchema.extend({
	...meta,
	usageCount: z.number().int().nonnegative(),
	lastUsedAt: z.number().nullable(),
});

export const ThemeSchema = ThemeInputSchema.extend(meta);

export const WorkspaceCatalogSchema = z.object({
	favorites: z.array(FavoriteSchema),
	commands: z.array(CommandSchema),
	themes: z.array(ThemeSchema),
	preferences: WorkspacePreferencesSchema.extend({ version: z.number().int().nonnegative() }),
});

export type Favorite = z.infer<typeof FavoriteSchema>;

export type QuickCommand = z.infer<typeof CommandSchema>;

export type TerminalTheme = z.infer<typeof ThemeInputSchema> & { id: string; version?: number };

export type WorkspaceCatalog = z.infer<typeof WorkspaceCatalogSchema>;

export const CatalogResourceSchema = z.enum(['favorites', 'commands', 'themes']);

export type CatalogResource = z.infer<typeof CatalogResourceSchema>;
