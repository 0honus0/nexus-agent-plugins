<script setup lang="ts">
	import { onMounted, onScopeDispose, ref, watch, nextTick, computed, inject, useId } from 'vue';
	import { Terminal } from '@xterm/xterm';
	import { FitAddon } from '@xterm/addon-fit';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import type { PluginWindowApi } from 'nexus-terminal/browser';
	import type { WorkspaceI18n } from './workspace-i18n';
	import type { SessionInfo } from '../shared/workspace-types';
	import type { SessionTransport } from './use-session-transport';
	import '@xterm/xterm/css/xterm.css';
	import TerminalBackgroundLayer from './appearance/TerminalBackgroundLayer.vue';
	import { useWorkspaceBackground } from './appearance/workspace-background';
	import { useWorkspaceCatalog } from './catalog/workspace-catalog';
	import { terminalDisplayStyle } from './appearance/terminal-display';
	import type { LayoutProfile } from '../shared/layout-types.js';
	import type { TerminalInput } from './terminal/terminal-input';
	import { useTerminalInteractions } from './terminal/use-terminal-interactions';
	import { createTerminalEchoLayer } from './terminal/terminal-echo-layer';
	import TerminalSelectionTools from './terminal/TerminalSelectionTools.vue';
	import { panePresentationKey } from './presentation/pane-presentation';
	const props = defineProps<{
		session: SessionInfo;
		transport: SessionTransport;
		active: boolean;
		input: TerminalInput;
		profile: LayoutProfile;
		ctx: PluginContextApi;
		view: PluginWindowApi;
		i18n: WorkspaceI18n;
	}>();
	const root = ref<HTMLElement>();
	const inputId = useId();
	const container = ref<HTMLElement>();
	const catalog = useWorkspaceCatalog();
	const presentation = inject(panePresentationKey, undefined);
	const fontSize = computed(() => presentation?.scales.terminal ?? catalog.display.value.fontSizes[props.profile]);
	const background = useWorkspaceBackground();
	const hasBackground = computed(
		() => background.settings.value.enabled && !!(background.imageUrl.value || background.html.value),
	);
	const selectedTheme = catalog.colors;
	let terminal: Terminal | undefined,
		observer: ResizeObserver | undefined,
		frame = 0,
		ready = false;
	const fit = new FitAddon();
	let unsubscribe: (() => void) | undefined;
	let unbindInput: (() => void) | undefined;
	let unbindEcho: (() => void) | undefined;
	let echo: ReturnType<typeof createTerminalEchoLayer> | undefined;

	function resize() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (!props.active || !root.value?.clientWidth || !terminal || !ready) return;
			terminal.options.fontSize = interactions.size.value;
			// Docking and re-showing a pane briefly produces zero-size content boxes.
			// Never propagate that transient geometry to the remote PTY or truncate its buffer.
			const dimensions = fit.proposeDimensions();
			if (!dimensions || dimensions.cols < 10 || dimensions.rows < 3) return;
			if (terminal.cols === dimensions.cols && terminal.rows === dimensions.rows) return;
			echo?.reset();
			terminal.resize(dimensions.cols, dimensions.rows);
			props.transport.send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
		});
	}

	function applyTheme() {
		if (!terminal) return;
		terminal.options.theme = {
			...selectedTheme.value,
			scrollbarSliderBackground: selectedTheme.value.foreground.slice(0, 7) + '30',
			scrollbarSliderHoverBackground: selectedTheme.value.foreground.slice(0, 7) + '55',
			scrollbarSliderActiveBackground: selectedTheme.value.foreground.slice(0, 7) + '80',
			...(hasBackground.value ? { background: '#00000000' } : {}),
		};
	}

	watch([selectedTheme, hasBackground], applyTheme);
	watch(
		() => catalog.state.value.preferences.localEcho,
		() => echo?.reset(),
	);
	watch([props.transport.connected, props.transport.terminalClosed], () => echo?.reset(), { flush: 'sync' });
	watch(
		() => props.active,
		async (active) => {
			echo?.reset();
			if (active) {
				await nextTick();
				resize();
				if (matchMedia('(pointer: fine)').matches) terminal?.focus();
			}
		},
	);
	onMounted(() => {
		terminal = new Terminal({
			fontFamily: catalog.display.value.fontFamily,
			fontSize: interactions.size.value,
			cursorBlink: true,
			allowTransparency: true,
			scrollback: 2000,
			allowProposedApi: false,
		});
		terminal.loadAddon(fit);
		const unbind = props.input.bindCursorMode(() => terminal?.modes.applicationCursorKeysMode ?? false);
		unbindInput = unbind;
		terminal.open(root.value!);
		if (terminal.textarea) terminal.textarea.id = inputId;
		applyTheme();
		echo = createTerminalEchoLayer(terminal, () => catalog.state.value.preferences.localEcho);
		unbindEcho = props.input.onSent((data, predict) => echo?.input(data, predict && ready));
		unsubscribe = props.transport.subscribe((message) => {
			if (message.type === 'snapshot') {
				ready = false;
				echo!.snapshot(message.data, message.cols, message.rows, () => {
					if (!terminal) return;
					ready = true;
					resize();
					if (props.active && matchMedia('(pointer: fine)').matches) terminal.focus();
				});
			} else if (message.type === 'output') echo!.write(message.data);
			else echo!.reset();
		});
		terminal.onData((data) => {
			if (ready) props.input.send(data);
		});
		observer = new ResizeObserver(resize);
		observer.observe(root.value!);
	});
	const interactions = useTerminalInteractions({
		root,
		frame: container,

		terminal: () => terminal,

		active: () => props.active && props.view.state.value.mode !== 'minimized',

		canInput: () => ready && props.transport.connected.value && !props.transport.terminalClosed.value,

		fontSize: () => fontSize.value,

		onFontSizeChange(size) {
			if (!presentation) return;
			presentation.scales.terminal = size;
			presentation.changed();
		},

		resize,

		onPaste: () => echo?.ignoreInput(),

		report: (code) => props.ctx.app.log.report({ level: 'error', code, userVisible: true }),
	});
	watch(fontSize, (size) => {
		interactions.size.value = size;
		resize();
	});
	watch(
		() => catalog.display.value.fontFamily,
		(family) => {
			if (!terminal) return;
			echo?.reset();
			terminal.options.fontFamily = family;
			resize();
		},
	);
	onScopeDispose(() => {
		cancelAnimationFrame(frame);
		unsubscribe?.();
		unbindInput?.();
		unbindEcho?.();
		echo?.dispose();
		observer?.disconnect();
		terminal?.dispose();
		terminal = undefined;
	});
</script>
<template>
	<div
		ref="container"
		class="workspace-terminal-frame"
		:class="{ 'has-background': hasBackground }"
		:style="{
			...terminalDisplayStyle(catalog.display.value),
			'--workspace-terminal-background': selectedTheme.background,
			'--workspace-terminal-foreground': selectedTheme.foreground,
		}"
	>
		<TerminalBackgroundLayer
			:settings="background.settings.value"
			:image-url="background.imageUrl.value"
			:html="background.html.value"
			:animated="background.animated.value"
			:active="active && background.windowVisible.value"
		/>
		<div
			ref="root"
			class="workspace-terminal"
			:style="hasBackground ? { background: 'transparent' } : undefined"
			:aria-label="session.name"
		/>
		<TerminalSelectionTools :controls="interactions" :i18n="i18n" />
	</div>
</template>
