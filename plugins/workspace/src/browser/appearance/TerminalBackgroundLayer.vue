<script setup lang="ts">
	import { computed, ref, watch } from 'vue';
	import { useDocumentVisibility, useResizeObserver } from '@vueuse/core';
	import { resolveLayoutProfile } from '../layout-profile.js';
	import type { BackgroundSettings } from '../../shared/workspace-background-types';
	import { createTerminalBackgroundDocument } from './terminal-background-document';
	const props = defineProps<{
		settings: BackgroundSettings;
		imageUrl?: string;
		html: string;
		animated: boolean;
		active: boolean;
	}>();
	const root = ref<HTMLElement>(),
		frame = ref<HTMLIFrameElement>();
	const visibility = useDocumentVisibility();
	const width = ref(0),
		height = ref(0);
	useResizeObserver(root, ([entry]) => {
		if (entry) {
			width.value = entry.contentRect.width;
			height.value = entry.contentRect.height;
		}
	});
	const visible = computed(
		() =>
			props.active &&
			props.settings.enabled &&
			visibility.value === 'visible' &&
			width.value > 0 &&
			height.value > 0,
	);
	const document = computed(() =>
		createTerminalBackgroundDocument({
			html: props.html,
			imageVisible: !!props.imageUrl,
			compact: resolveLayoutProfile(width.value) === 'compact',
			motion: true,
		}),
	);

	function ready() {
		frame.value?.contentWindow?.postMessage(
			{ type: 'nexus-background-geometry', visible: visible.value, motion: props.animated },
			'*',
		);
	}

	watch([visible, () => props.animated], ready, { flush: 'post' });
</script>
<template>
	<div ref="root" class="workspace-background-layer" aria-hidden="true">
		<div
			v-if="settings.enabled && imageUrl"
			class="workspace-background-image"
			:style="{ backgroundImage: `url(${JSON.stringify(imageUrl)})`, backgroundSize: settings.fit }"
		/>
		<!-- Unmount hidden frames: custom timer loops cannot continue behind a hidden application. -->
		<iframe
			v-if="visible && html"
			ref="frame"
			class="workspace-background-frame"
			:srcdoc="document"
			sandbox="allow-scripts"
			referrerpolicy="no-referrer"
			tabindex="-1"
			@load="ready"
		/>
		<div
			v-if="settings.enabled && (imageUrl || html)"
			class="workspace-background-overlay"
			:style="{ opacity: settings.overlay }"
		/>
	</div>
</template>
