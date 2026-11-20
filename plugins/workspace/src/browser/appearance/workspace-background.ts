import { computed, inject, onScopeDispose, ref, type InjectionKey } from 'vue';
import type { PluginContextApi } from 'nexus-terminal/browser';
import type { PluginWindowApi } from 'nexus-terminal/browser';
import { useMutationObserver } from '@vueuse/core';
import {
	BackgroundSnapshotSchema,
	BackgroundSettingsSchema,
	defaultBackgroundSettings,
	type BackgroundSettings,
	type BackgroundPreset,
	type BackgroundSnapshot,
} from '../../shared/workspace-background-types';
import { terminalBackgroundPresets } from '../../shared/terminal-background-presets';
import { createWorkspaceClient } from '../workspace-client';
import { createOptimisticDocument } from '../optimistic-document';

function createBackgroundDocument(ctx: PluginContextApi) {
	const signal = ctx.signal;
	const client = createWorkspaceClient(ctx, signal);
	const document = createOptimisticDocument(
		BackgroundSnapshotSchema.parse({
			settings: defaultBackgroundSettings,
			version: 0,
			image: null,
			presets: [],
		}),
		{
			read: () => client.request('appearance', undefined, undefined, BackgroundSnapshotSchema),

			write: (value) =>
				client.request(
					'appearance/settings',
					'PATCH',
					{
						version: value.version,
						value: value.settings,
					},
					BackgroundSnapshotSchema,
				),

			report: client.report,
			signal,
			tasks: ctx.app.tasks,
		},
	);
	return { document, client, signal };
}

const documents = new WeakMap<PluginContextApi, ReturnType<typeof createBackgroundDocument>>();

export function createWorkspaceBackground(ctx: PluginContextApi, view: PluginWindowApi) {
	let shared = documents.get(ctx);
	if (!shared) {
		shared = createBackgroundDocument(ctx);
		documents.set(ctx, shared);
		ctx.onDispose(() => {
			documents.delete(ctx);
		});
	}
	const { document, client, signal } = shared;
	const { state, loaded, busy, refresh } = document;
	const overlayPreview = ref<number>();
	const settings = computed(() => ({
		...state.value.settings,
		overlay: overlayPreview.value ?? state.value.settings.overlay,
	}));
	const html = computed(
		() =>
			terminalBackgroundPresets.find((item) => item.id === settings.value.preset)?.html ??
			state.value.presets.find((item) => item.id === settings.value.preset)?.html ??
			'',
	);
	const imageUrl = computed(() =>
		state.value.image ? client.url('appearance/image/' + state.value.image.id) : undefined,
	);
	const root = window.document.documentElement;
	const motion = ref(root.dataset.uiMotion !== 'reduced');
	useMutationObserver(root, () => (motion.value = root.dataset.uiMotion !== 'reduced'), {
		attributes: true,
		attributeFilter: ['data-ui-motion'],
	});
	const animated = computed(() => settings.value.animation && motion.value);
	const windowVisible = computed(() => view.state.value.mode !== 'minimized');

	const mutate = (run: () => Promise<BackgroundSnapshot>) => document.mutate(run);

	function patch(value: Partial<BackgroundSettings>) {
		return document.change((snapshot) => ({
			...snapshot,
			settings: BackgroundSettingsSchema.parse({ ...snapshot.settings, ...value }),
		}));
	}

	const savePreset = (value: { name: string; html: string }, item?: BackgroundPreset) =>
		mutate(() =>
			client.request(
				'appearance/presets' + (item ? '/' + item.id : ''),
				item ? 'PUT' : 'POST',
				{
					version: item?.version ?? 0,
					value,
				},
				BackgroundSnapshotSchema,
			),
		);

	const removePreset = (item: BackgroundPreset) =>
		mutate(() =>
			client.request(
				'appearance/presets/' + item.id,
				'DELETE',
				{ version: item.version },
				BackgroundSnapshotSchema,
			),
		);

	const removeImage = () =>
		mutate(() =>
			client.request('appearance/image', 'DELETE', { version: state.value.version }, BackgroundSnapshotSchema),
		);

	const upload = (file: File) =>
		mutate(async () => {
			const response = await client.binary('appearance/image', {
				method: 'PUT',
				body: file,
				signal,
				headers: { 'Content-Type': 'application/octet-stream', 'If-Match': String(state.value.version) },
			});
			return BackgroundSnapshotSchema.parse(await response.json());
		});

	void refresh();
	onScopeDispose(() => {
		overlayPreview.value = undefined;
	});
	return {
		state,
		settings,
		html,
		imageUrl,
		animated,
		windowVisible,
		loaded,
		busy,
		overlayPreview,
		patch,
		savePreset,
		removePreset,
		removeImage,
		upload,
		report: client.report,
	};
}

export const workspaceBackgroundKey: InjectionKey<ReturnType<typeof createWorkspaceBackground>> =
	Symbol('workspace-background');

export const useWorkspaceBackground = () => inject(workspaceBackgroundKey)!;
