import { computed, inject, ref, type InjectionKey } from 'vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import {
	WorkspaceCatalogSchema,
	type WorkspaceCatalog,
	WorkspacePreferencesSchema,
	type CatalogResource,
} from '../../shared/workspace-catalog-types';
import { createWorkspaceClient } from '../workspace-client';
import type { TerminalDisplay } from '../../shared/workspace-terminal-types';
import { terminalThemePresets } from '../../shared/terminal-theme-presets';
import { resolveTerminalColors } from '../appearance/terminal-colors';
import { mergeTerminalDisplay, type TerminalDisplayPatch } from '../appearance/terminal-display';
import { createOptimisticDocument } from '../optimistic-document';

function createCatalogDocument(ctx: PluginContextApi) {
	const { request, report } = createWorkspaceClient(ctx, ctx.signal);
	const document = createOptimisticDocument<WorkspaceCatalog>(
		{
			favorites: [],
			commands: [],
			themes: [],
			preferences: { ...WorkspacePreferencesSchema.parse({ theme: null }), version: 0 },
		},
		{
			read: () => request('catalog', undefined, undefined, WorkspaceCatalogSchema),

			write: async (value) =>
				await request('catalog/preferences', 'PUT', value.preferences, WorkspaceCatalogSchema),

			report,
			signal: ctx.signal,
			tasks: ctx.app.tasks,
		},
	);
	return { document, request, report };
}

const documents = new WeakMap<PluginContextApi, ReturnType<typeof createCatalogDocument>>();

/** Module-owned document survives windows; previews remain local to each window. */
export function createWorkspaceCatalog(ctx: PluginContextApi) {
	let shared = documents.get(ctx);
	if (!shared) {
		shared = createCatalogDocument(ctx);
		documents.set(ctx, shared);
		ctx.onDispose(() => {
			documents.delete(ctx);
		});
	}
	const { document, request, report } = shared;
	const { state, loaded, busy, refresh } = document;
	const displayPreview = ref<TerminalDisplay>();
	const display = computed(() => displayPreview.value ?? state.value.preferences.display);
	const colors = computed(() =>
		resolveTerminalColors(
			[...terminalThemePresets, ...state.value.themes].find((theme) => theme.id === state.value.preferences.theme)
				?.colors,
		),
	);

	const mutate = (path: string, method: string, data?: unknown) =>
		document.mutate(() => request('catalog/' + path, method, data, WorkspaceCatalogSchema));

	const save = (kind: CatalogResource, value: unknown, item?: { id: string; version: number }) =>
		mutate(kind + (item ? '/' + item.id : ''), item ? 'PUT' : 'POST', {
			version: item?.version ?? 0,
			value,
		});

	const remove = (kind: CatalogResource, item: { id: string; version: number }) =>
		mutate(kind + '/' + item.id, 'DELETE', { version: item.version });

	type PreferencesPatch = Partial<Omit<WorkspaceCatalog['preferences'], 'version' | 'display'>> & {
		display?: TerminalDisplayPatch;
	};

	function preferences(patch: PreferencesPatch) {
		return document.change((snapshot) => {
			const { version, ...previous } = snapshot.preferences;
			return {
				...snapshot,
				preferences: {
					...WorkspacePreferencesSchema.parse({
						...previous,
						...patch,
						display: mergeTerminalDisplay(previous.display, patch.display ?? {}),
					}),
					version,
				},
			};
		});
	}

	void refresh();
	return {
		state,
		loaded,
		busy,
		refresh,
		save,
		remove,
		preferences,
		display,
		colors,
		displayPreview,

		theme: (id: string | null) => preferences({ theme: id }),

		report,

		used: (id: string) => mutate('commands/' + id + '/use', 'POST'),
	};
}

export const workspaceCatalogKey: InjectionKey<ReturnType<typeof createWorkspaceCatalog>> = Symbol('workspace-catalog');

export function useWorkspaceCatalog() {
	return inject(workspaceCatalogKey)!;
}
