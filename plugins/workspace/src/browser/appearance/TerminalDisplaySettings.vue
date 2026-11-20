<script setup lang="ts">
	import { onScopeDispose, ref, useId, watch } from 'vue';
	import { Type } from '@lucide/vue';
	import { LayoutProfileSchema, type LayoutProfile } from '../../shared/layout-types.js';
	import { UiField, UiInput, UiSlider, UiSwitch } from 'nexus-terminal/browser/ui';
	import { TerminalDisplaySchema } from '../../shared/workspace-terminal-types';
	import { useWorkspaceCatalog } from '../catalog/workspace-catalog';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import { terminalDisplayStyle, mergeTerminalDisplay, type TerminalDisplayPatch } from './terminal-display';

	const props = defineProps<{ i18n: WorkspaceI18n; profile: LayoutProfile }>();
	const catalog = useWorkspaceCatalog();
	const { display, colors, loaded } = catalog;
	const font = ref(display.value.fontFamily);
	const controlsId = useId();
	const shadowFields = [
		{ key: 'offsetX', min: -10, max: 10, step: 1 },
		{ key: 'offsetY', min: -10, max: 10, step: 1 },
		{ key: 'blur', min: 0, max: 20, step: 1 },
	] as const;

	watch(
		() => display.value.fontFamily,
		(value) => {
			font.value = value;
		},
	);

	function preview(patch: TerminalDisplayPatch) {
		catalog.displayPreview.value = TerminalDisplaySchema.parse(mergeTerminalDisplay(display.value, patch));
	}

	function update(patch: TerminalDisplayPatch) {
		if (!loaded.value) return;
		const result = TerminalDisplaySchema.safeParse(mergeTerminalDisplay(display.value, patch));
		if (!result.success) {
			font.value = display.value.fontFamily;
			catalog.report({ code: 'WORKSPACE_DISPLAY_INVALID' });
			return;
		}
		catalog.displayPreview.value = undefined;
		void catalog.preferences({ display: patch });
	}

	onScopeDispose(() => {
		catalog.displayPreview.value = undefined;
	});
</script>
<template>
	<section class="workspace-tool-panel workspace-display-panel">
		<header class="workspace-tool-heading">
			<span class="workspace-library-symbol"><Type :size="20" /></span>
			<div>
				<h3>{{ i18n.t('display.title') }}</h3>
				<p>{{ i18n.t('display.hint') }}</p>
			</div>
		</header>
		<div
			class="workspace-display-preview"
			:style="{
				...terminalDisplayStyle(display),
				fontFamily: display.fontFamily,
				fontSize: display.fontSizes[profile] + 'px',
				background: colors.background,
				color: colors.foreground,
			}"
		>
			<code>nexus ~/workspace</code><code>$ printf 'Hello, 世界!'</code>
		</div>
		<UiField :label="i18n.t('display.fontFamily')" v-slot="field">
			<UiInput
				v-model="font"
				:id="field.id"
				:disabled="!loaded"
				maxlength="500"
				@change="update({ fontFamily: font })"
			/>
		</UiField>
		<p class="workspace-background-hint">{{ i18n.t('display.fontHint') }}</p>
		<div class="workspace-display-section">
			<h4>{{ i18n.t('display.fontSizes') }}</h4>
			<div v-for="profile in LayoutProfileSchema.options" :key="profile" class="workspace-display-slider">
				<span :id="controlsId + '-' + profile">{{ i18n.t('display.' + profile) }}</span>
				<UiSlider
					:model-value="display.fontSizes[profile]"
					:min="8"
					:max="40"
					:step="1"
					:disabled="!loaded"
					:aria-labelledby="controlsId + '-' + profile"
					@update:model-value="preview({ fontSizes: { [profile]: $event } })"
					@commit="update({ fontSizes: { [profile]: $event } })"
					@cancel="catalog.displayPreview.value = undefined"
				/>
				<output>{{ i18n.n(display.fontSizes[profile]) }} px</output>
			</div>
			<p class="workspace-background-hint">{{ i18n.t('display.sizeHint') }}</p>
		</div>
		<div class="workspace-display-section">
			<label class="workspace-display-toggle"
				><span>{{ i18n.t('display.stroke') }}</span
				><UiSwitch
					:model-value="display.stroke.enabled"
					:disabled="!loaded"
					:aria-label="i18n.t('display.stroke')"
					@update:model-value="update({ stroke: { enabled: $event } })"
			/></label>
			<div class="workspace-display-slider">
				<span :id="controlsId + '-stroke-width'">{{ i18n.t('display.strokeWidth') }}</span>
				<UiSlider
					:model-value="display.stroke.width"
					:min="0"
					:max="2"
					:step="0.1"
					:disabled="!loaded"
					:aria-labelledby="controlsId + '-stroke-width'"
					@update:model-value="preview({ stroke: { width: $event } })"
					@commit="update({ stroke: { width: $event } })"
					@cancel="catalog.displayPreview.value = undefined"
				/>
				<output>{{ i18n.n(display.stroke.width) }} px</output>
			</div>
			<label class="workspace-display-toggle"
				><span>{{ i18n.t('display.strokeColor') }}</span
				><input
					type="color"
					:id="controlsId + '-stroke-color'"
					:value="display.stroke.color"
					:disabled="!loaded"
					:aria-label="i18n.t('display.strokeColor')"
					@change="update({ stroke: { color: ($event.target as HTMLInputElement).value } })"
			/></label>
		</div>
		<div class="workspace-display-section">
			<label class="workspace-display-toggle"
				><span>{{ i18n.t('display.shadow') }}</span
				><UiSwitch
					:model-value="display.shadow.enabled"
					:disabled="!loaded"
					:aria-label="i18n.t('display.shadow')"
					@update:model-value="update({ shadow: { enabled: $event } })"
			/></label>
			<div v-for="field in shadowFields" :key="field.key" class="workspace-display-slider">
				<span :id="controlsId + '-' + field.key">{{ i18n.t('display.' + field.key) }}</span>
				<UiSlider
					:model-value="display.shadow[field.key]"
					:min="field.min"
					:max="field.max"
					:step="field.step"
					:disabled="!loaded"
					:aria-labelledby="controlsId + '-' + field.key"
					@update:model-value="preview({ shadow: { [field.key]: $event } })"
					@commit="update({ shadow: { [field.key]: $event } })"
					@cancel="catalog.displayPreview.value = undefined"
				/>
				<output>{{ i18n.n(display.shadow[field.key]) }} px</output>
			</div>
			<label class="workspace-display-toggle"
				><span>{{ i18n.t('display.shadowColor') }}</span
				><input
					type="color"
					:id="controlsId + '-shadow-color'"
					:value="display.shadow.color"
					:disabled="!loaded"
					:aria-label="i18n.t('display.shadowColor')"
					@change="update({ shadow: { color: ($event.target as HTMLInputElement).value } })"
			/></label>
		</div>
	</section>
</template>
