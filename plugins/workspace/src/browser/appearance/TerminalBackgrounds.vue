<script setup lang="ts">
	import { WorkspaceModuleError } from '../workspace-error';

	import { computed, ref, useId } from 'vue';
	import { Image, Upload, Trash2, Plus, Check, Pencil, Download, Sparkles, Code } from '@lucide/vue';
	import {
		UiButton,
		UiSwitch,
		UiSlider,
		UiSelect,
		UiInput,
		UiField,
		UiDialog,
		UiEmptyState,
	} from 'nexus-terminal/browser/ui';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import {
		BackgroundPresetInputSchema,
		backgroundHtmlLimit,
		backgroundImageLimit,
		type BackgroundPreset,
	} from '../../shared/workspace-background-types';
	import { terminalBackgroundPresets } from '../../shared/terminal-background-presets';
	import { useWorkspaceBackground } from './workspace-background';
	import TerminalBackgroundLayer from './TerminalBackgroundLayer.vue';
	const props = defineProps<{ i18n: WorkspaceI18n; active: boolean }>();
	const { t, n } = props.i18n;
	const background = useWorkspaceBackground();
	const { settings, state, imageUrl, html, animated, windowVisible, loaded, busy, overlayPreview } = background;
	const imageInput = ref<HTMLInputElement>(),
		htmlInput = ref<HTMLInputElement>();
	const controlsId = useId();
	const search = ref(''),
		editing = ref(false),
		copying = ref(false),
		selected = ref<BackgroundPreset>(),
		name = ref(''),
		content = ref('');
	const presets = computed(() =>
		[
			...terminalBackgroundPresets.map((item) => ({
				id: item.id,
				name: t('background.presets.' + item.nameKey),
				html: item.html,
				version: 0,
			})),
			...state.value.presets,
		].filter((item) => item.name.toLowerCase().includes(search.value.toLowerCase())),
	);

	function edit(item?: { name: string; html: string; id: string; version: number }) {
		selected.value = item?.version ? item : undefined;
		copying.value = !!item && !item.version;
		name.value = item?.name ?? '';
		content.value = item?.html ?? '';
		editing.value = true;
	}

	async function save() {
		if (await background.savePreset({ name: name.value, html: content.value }, selected.value))
			editing.value = false;
	}

	async function upload(event: Event) {
		const input = event.target as HTMLInputElement,
			file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > backgroundImageLimit) {
			background.report({ code: 'WORKSPACE_BACKGROUND_TOO_LARGE' });
			return;
		}
		await background.upload(file);
	}

	async function importHtml(event: Event) {
		const input = event.target as HTMLInputElement,
			file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			if (file.size > backgroundHtmlLimit) throw new WorkspaceModuleError('WORKSPACE_OPERATION_FAILED');
			const value = BackgroundPresetInputSchema.parse({
				name: file.name.replace(/\.html?$/i, ''),
				html: await file.text(),
			});
			name.value = value.name;
			content.value = value.html;
			selected.value = undefined;
			copying.value = false;
			editing.value = true;
		} catch {
			background.report({ code: 'WORKSPACE_BACKGROUND_HTML_INVALID' });
		}
	}

	function download(item: { html: string }) {
		const url = URL.createObjectURL(new Blob([item.html], { type: 'text/html' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'terminal-background.html';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
</script>
<template>
	<section class="workspace-background-panel">
		<div class="workspace-background-controls">
			<label
				><span>{{ t('background.enabled') }}</span
				><UiSwitch
					:model-value="settings.enabled"
					:disabled="!loaded"
					:aria-label="t('background.enabled')"
					@update:model-value="background.patch({ enabled: $event })"
			/></label>
			<label
				><span>{{ t('background.animation') }}</span
				><UiSwitch
					:model-value="settings.animation"
					:disabled="!loaded"
					:aria-label="t('background.animation')"
					@update:model-value="background.patch({ animation: $event })"
			/></label>
		</div>
		<div class="workspace-background-preview">
			<TerminalBackgroundLayer
				:settings="settings"
				:image-url="imageUrl"
				:html="html"
				:animated="animated"
				:active="active && windowVisible"
			/>
			<div class="workspace-background-preview-copy">
				<span>{{ t('background.preview') }}</span><strong>nexus ~</strong><code>$ echo hello</code>
			</div>
		</div>
		<div class="workspace-background-image-tools">
			<UiButton :loading="busy" :disabled="!loaded" @click="imageInput?.click()"
				><Upload :size="15" />{{ t('background.uploadImage') }}</UiButton
			>
			<UiButton
				appearance="ghost"
				icon-only
				:aria-label="t('background.removeImage')"
				:disabled="busy || !state.image"
				@click="background.removeImage"
				><Trash2 :size="16"
			/></UiButton>
			<UiSelect
				:model-value="settings.fit"
				:aria-label="t('background.fit')"
				:disabled="!loaded"
				:options="[
					{ value: 'cover', label: t('background.cover') },
					{ value: 'contain', label: t('background.contain') },
				]"
				@update:model-value="background.patch({ fit: $event as 'cover' | 'contain' })"
			/>
			<input
				ref="imageInput"
				:id="controlsId + '-image'"
				:aria-label="t('background.uploadImage')"
				type="file"
				accept="image/png,image/jpeg,image/webp,image/gif"
				hidden
				@change="upload"
			/>
		</div>
		<div class="workspace-background-opacity">
			<span :id="controlsId + '-overlay'">{{ t('background.overlay') }}</span>
			<UiSlider
				:model-value="settings.overlay"
				:min="0"
				:max="1"
				:step="0.01"
				:disabled="!loaded"
				:aria-labelledby="controlsId + '-overlay'"
				@update:model-value="overlayPreview = $event"
				@commit="
					overlayPreview = undefined;
					background.patch({ overlay: $event });
				"
				@cancel="overlayPreview = undefined"
			/>
			<output>{{ n(Math.round(settings.overlay * 100)) }}%</output>
		</div>
		<p class="workspace-background-hint">{{ t('background.motionHint') }}</p>
		<div class="workspace-background-presets-heading">
			<h3><Sparkles :size="16" />{{ t('background.library') }}</h3>
			<UiButton
				appearance="ghost"
				:disabled="!loaded || !settings.preset"
				@click="background.patch({ preset: null })"
				>{{ t('background.clearPreset') }}</UiButton
			>
		</div>
		<div class="workspace-library-toolbar">
			<UiInput v-model="search" :aria-label="t('background.search')" :placeholder="t('background.search')" />
			<UiButton
				appearance="ghost"
				icon-only
				:aria-label="t('background.import')"
				:disabled="!loaded"
				@click="htmlInput?.click()"
				><Upload :size="16"
			/></UiButton>
			<UiButton appearance="ghost" icon-only :aria-label="t('background.new')" :disabled="!loaded" @click="edit()"
				><Plus :size="17"
			/></UiButton>
			<input
				ref="htmlInput"
				:id="controlsId + '-html'"
				:aria-label="t('background.import')"
				type="file"
				accept=".html,.htm,text/html"
				hidden
				@change="importHtml"
			/>
		</div>
		<div class="workspace-background-preset-grid">
			<article
				v-for="(item, index) in presets"
				:key="item.id"
				class="workspace-background-preset"
				:class="{ 'is-active': settings.preset === item.id }"
			>
				<button
					type="button"
					class="workspace-background-preset-main"
					:disabled="!loaded"
					:aria-label="t('background.apply', { name: item.name })"
					@click="background.patch({ preset: item.id, enabled: true })"
				>
					<span class="workspace-background-preset-art" :data-variant="index % 4"
						><Code v-if="item.version" :size="23" /><Sparkles v-else :size="23"
					/></span>
					<span
						><strong>{{ item.name }}</strong
						><small>{{ t(item.version ? 'background.custom' : 'background.builtin') }}</small></span
					><Check v-if="settings.preset === item.id" :size="16" />
				</button>
				<div class="workspace-background-preset-actions">
					<UiButton
						appearance="ghost"
						icon-only
						:aria-label="t(item.version ? 'tools.editNamed' : 'tools.copyNamed', { name: item.name })"
						:disabled="busy"
						@click="edit(item)"
						><Pencil :size="14"
					/></UiButton>
					<UiButton
						appearance="ghost"
						icon-only
						:aria-label="t('background.export', { name: item.name })"
						@click="download(item)"
						><Download :size="14"
					/></UiButton>
					<UiButton
						v-if="item.version"
						appearance="ghost"
						icon-only
						:aria-label="t('tools.removeNamed', { name: item.name })"
						:disabled="busy"
						@click="background.removePreset(item)"
						><Trash2 :size="14"
					/></UiButton>
				</div>
			</article>
		</div>
		<UiEmptyState v-if="!presets.length" :title="t('tools.noResults')" :icon="Image" />
	</section>
	<UiDialog
		:open="editing"
		:title="t(copying ? 'tools.createCopy' : selected ? 'background.edit' : 'background.new')"
		:close-label="t('cancel')"
		@update:open="editing = $event"
	>
		<div class="workspace-editor-form">
			<UiField :label="t('tools.name')" v-slot="field"><UiInput v-model="name" :id="field.id" /></UiField
			><UiField :label="t('background.html')" v-slot="field">
				<textarea
					v-model="content"
					:id="field.id"
					class="workspace-code-input workspace-background-editor"
					spellcheck="false"
				/>
			</UiField>
		</div>
		<template #footer
			><UiButton @click="editing = false">{{ t('cancel') }}</UiButton
			><UiButton
				tone="primary"
				:loading="busy"
				:disabled="!BackgroundPresetInputSchema.safeParse({ name, html: content }).success"
				@click="save"
				>{{ t(copying ? 'tools.saveAs' : 'tools.save') }}</UiButton
			></template
		>
	</UiDialog>
</template>
