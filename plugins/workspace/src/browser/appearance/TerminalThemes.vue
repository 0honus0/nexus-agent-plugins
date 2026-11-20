<script setup lang="ts">
	import { WorkspaceModuleError } from '../workspace-error';

	import { computed, ref, watch, useId } from 'vue';
	import { Palette, Plus, Upload, Download, Pencil, Trash2, Check, Code } from '@lucide/vue';
	import { UiButton, UiInput, UiDialog, UiField, UiEmptyState, UiTabs } from 'nexus-terminal/browser/ui';
	import {
		terminalColorKeys,
		TerminalColorsSchema,
		ThemeInputSchema,
		type TerminalTheme,
	} from '../../shared/workspace-catalog-types';
	import { terminalThemePresets } from '../../shared/terminal-theme-presets';
	import { resolveTerminalColors } from './terminal-colors';
	import { readTerminalThemeFile } from './terminal-theme-file';
	import { useWorkspaceCatalog } from '../catalog/workspace-catalog';
	import type { WorkspaceI18n } from '../workspace-i18n';
	const props = defineProps<{ i18n: WorkspaceI18n }>();
	const { t } = props.i18n;
	const catalog = useWorkspaceCatalog();
	const search = ref(''),
		editing = ref(false),
		name = ref('');
	const colors = ref<Record<string, string>>(resolveTerminalColors());
	const editorMode = ref('palette'),
		colorJson = ref('');
	const copying = ref(false);
	const errorId = useId();
	const controlsId = useId();
	const jsonResult = computed(() => {
		let value: unknown;
		try {
			value = JSON.parse(colorJson.value);
		} catch {
			return { error: 'tools.jsonSyntaxError', colors: undefined };
		}
		const result = TerminalColorsSchema.safeParse(value);
		return result.success
			? { colors: result.data, error: undefined }
			: { colors: undefined, error: 'tools.jsonColorsError' };
	});
	const draftColors = computed(() => (editorMode.value === 'palette' ? colors.value : jsonResult.value.colors));
	const valid = computed(() => ThemeInputSchema.safeParse({ name: name.value, colors: draftColors.value }).success);

	watch(
		editorMode,
		(_mode, previous) => {
			if (previous === 'json' && jsonResult.value.colors)
				colors.value = resolveTerminalColors(jsonResult.value.colors);
		},
		{ flush: 'sync' },
	);
	watch(
		colors,
		(value) => {
			// Invalid JSON survives mode switches until the user edits the palette or corrects the JSON.
			if (editorMode.value === 'palette') colorJson.value = JSON.stringify(value, null, 2);
		},
		{ deep: true, flush: 'sync' },
	);

	const selected = ref<TerminalTheme>(),
		input = ref<HTMLInputElement>();
	const themes = computed<TerminalTheme[]>(() =>
		[...terminalThemePresets, ...catalog.state.value.themes].map((theme) => ({
			...theme,
			colors: resolveTerminalColors(theme.colors),
		})),
	);
	const filtered = computed(() =>
		themes.value.filter((theme) => theme.name.toLowerCase().includes(search.value.toLowerCase())),
	);
	const active = computed(() => catalog.state.value.preferences.theme);

	function edit(theme?: TerminalTheme) {
		editorMode.value = 'palette';
		selected.value = theme?.version ? theme : undefined;
		copying.value = !!theme && !theme.version;
		name.value = theme?.name ?? '';
		colors.value = resolveTerminalColors(theme?.colors);
		colorJson.value = JSON.stringify(colors.value, null, 2);
		editing.value = true;
	}

	async function save() {
		if (!valid.value) return;
		const current = selected.value;
		if (
			await catalog.save(
				'themes',
				{ name: name.value, colors: draftColors.value },
				current?.version ? { id: current.id, version: current.version } : undefined,
			)
		)
			editing.value = false;
	}

	function exportTheme(theme: TerminalTheme) {
		const url = URL.createObjectURL(
			new Blob([JSON.stringify({ name: theme.name, colors: theme.colors }, null, 2)], {
				type: 'application/json',
			}),
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'terminal-theme.json';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	async function importTheme(event: Event) {
		const element = event.target as HTMLInputElement,
			file = element.files?.[0];
		element.value = '';
		if (!file) return;
		try {
			if (file.size > 1024 * 1024) throw new WorkspaceModuleError('WORKSPACE_OPERATION_FAILED');
			const entries = readTerminalThemeFile(await file.text(), file.name);
			for (const entry of entries) if (!(await catalog.save('themes', entry))) break;
		} catch {
			catalog.report({ code: 'WORKSPACE_THEME_INVALID' });
		}
	}
</script>
<template>
	<section class="workspace-tool-panel workspace-theme-panel">
		<header class="workspace-tool-heading">
			<span class="workspace-library-symbol"><Palette :size="20" /></span>
			<div>
				<h3>{{ t('tools.themes') }}</h3>
				<p>{{ t('tools.themeHint') }}</p>
			</div>
		</header>
		<div class="workspace-library-toolbar">
			<UiInput
				v-model="search"
				:placeholder="t('tools.searchThemes')"
				:aria-label="t('tools.searchThemes')"
			/><UiButton
				appearance="ghost"
				icon-only
				:aria-label="t('tools.importTheme')"
				:disabled="!catalog.loaded.value || catalog.busy.value"
				@click="input?.click()"
				><Upload :size="17" /></UiButton
			><UiButton appearance="ghost" icon-only :aria-label="t('tools.newTheme')" @click="edit()"
				><Plus :size="17" /></UiButton
			><input
				ref="input"
				:id="controlsId + '-file'"
				:aria-label="t('tools.importTheme')"
				type="file"
				accept=".json,application/json"
				hidden
				@change="importTheme"
			/>
		</div>
		<button
			class="workspace-theme-default"
			:aria-pressed="active === null"
			:disabled="!catalog.loaded.value"
			@click="catalog.theme(null)"
		>
			<Palette :size="18" /><span>{{ t('tools.defaultTheme') }}</span
			><Check v-if="active === null" :size="17" />
		</button>
		<div class="workspace-theme-grid">
			<article
				v-for="theme in filtered"
				:key="theme.id"
				class="workspace-theme-card"
				:class="{ 'is-active': active === theme.id }"
			>
				<button
					class="workspace-theme-preview"
					:style="{ background: theme.colors.background, color: theme.colors.foreground }"
					:aria-label="t('tools.applyTheme', { name: theme.name })"
					:disabled="!catalog.loaded.value"
					@click="catalog.theme(theme.id)"
				>
					<span class="workspace-theme-prompt">nexus ~/workspace</span
					><span
						>$ printf 'ANSI'
						<span
							class="workspace-theme-cursor"
							:style="{ background: theme.colors.cursor ?? theme.colors.foreground }"
					/></span>
					<span class="workspace-theme-swatches"
						><i
							v-for="color in ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const"
							:key="color"
							:style="{ background: theme.colors[color] ?? theme.colors.foreground }"
					/></span>
				</button>
				<div class="workspace-theme-caption">
					<strong>{{ theme.name }}</strong><Check v-if="active === theme.id" :size="14" /><UiButton
						appearance="ghost"
						icon-only
						:aria-label="t(theme.version ? 'tools.editNamed' : 'tools.copyNamed', { name: theme.name })"
						@click="edit(theme)"
						><Pencil :size="14" /></UiButton
					><UiButton
						appearance="ghost"
						icon-only
						:aria-label="t('tools.exportTheme')"
						@click="exportTheme(theme)"
						><Download :size="14" /></UiButton
					><UiButton
						v-if="theme.version"
						appearance="ghost"
						icon-only
						:aria-label="t('tools.removeNamed', { name: theme.name })"
						:disabled="catalog.busy.value"
						@click="catalog.remove('themes', { id: theme.id, version: theme.version })"
						><Trash2 :size="14"
					/></UiButton>
				</div>
			</article>
		</div>
		<UiEmptyState v-if="!filtered.length" :title="t('tools.noResults')" :icon="Palette" />
	</section>
	<UiDialog
		:open="editing"
		:title="t(copying ? 'tools.createCopy' : selected ? 'tools.editTheme' : 'tools.newTheme')"
		:close-label="t('cancel')"
		@update:open="editing = $event"
	>
		<div class="workspace-editor-form">
			<UiField :label="t('tools.name')" v-slot="field"><UiInput v-model="name" :id="field.id" /></UiField>
			<UiTabs
				v-model="editorMode"
				:label="t('tools.themeEditor')"
				:options="[
					{
						value: 'palette',
						label: t('tools.paletteEditor'),
						icon: Palette,
					},
					{ value: 'json', label: 'JSON', icon: Code },
				]"
			>
				<template #palette
					><div class="workspace-color-grid">
						<label v-for="key in terminalColorKeys" :key="key"
							><span>{{ t('tools.colors.' + key) }}</span
							><input
								type="color"
								:id="controlsId + '-' + key"
								:value="(colors[key] ?? '#808080').slice(0, 7)"
								@input="colors[key] = ($event.target as HTMLInputElement).value"
						/></label>
					</div>
				</template>
				<template #json>
					<UiField :label="t('tools.jsonEditor')" v-slot="field">
						<textarea
							v-model="colorJson"
							:id="field.id"
							class="workspace-code-input"
							rows="14"
							spellcheck="false"
							:aria-invalid="!!jsonResult.error"
							:aria-describedby="errorId"
						/>
						<p :id="errorId" class="workspace-color-validation" aria-live="polite">
							{{ jsonResult.error ? t(jsonResult.error) : '\u00a0' }}
						</p>
					</UiField>
				</template>
			</UiTabs>
		</div>
		<template #footer
			><UiButton @click="editing = false">{{ t('cancel') }}</UiButton
			><UiButton tone="primary" :loading="catalog.busy.value" :disabled="!valid" @click="save">{{
				t(copying ? 'tools.saveAs' : 'tools.save')
			}}</UiButton></template
		>
	</UiDialog>
</template>

<style scoped>
	.workspace-color-validation {
		min-block-size: 2.5em;
		margin: 0;
		font-size: 0.8rem;
		color: var(--ui-danger, #dc5464);
	}
</style>
