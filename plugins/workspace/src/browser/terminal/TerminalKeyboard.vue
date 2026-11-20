<script setup lang="ts">
	import { computed, onScopeDispose, ref, watch } from 'vue';
	import { useDocumentVisibility, useEventListener } from '@vueuse/core';
	import type { TerminalInput } from './terminal-input';
	import type { TerminalKey } from './terminal-keys';
	import type { TerminalModifier } from './terminal-sticky-modifiers';
	import type { WorkspaceI18n } from '../workspace-i18n';
	const props = defineProps<{
		input: TerminalInput;
		active: boolean;
		enabled: boolean;
		i18n: WorkspaceI18n;
	}>();
	const functionPage = ref(false);
	type KeyDefinition =
		| { kind: 'key'; id: TerminalKey; label: string }
		| { kind: 'modifier'; id: TerminalModifier; label: string }
		| { kind: 'page' | 'spacer'; id: string; label: string };

	const key = (id: TerminalKey, label: string): KeyDefinition => ({ kind: 'key', id, label });

	// Keep the first three columns fixed on both pages, as in the original keyboard.
	const prefixes: KeyDefinition[][] = [
		[
			key('escape', 'Esc'),
			{ kind: 'page', id: 'fn', label: 'Fn' },
			{ kind: 'modifier', id: 'shift', label: 'Shift' },
		],
		[
			key('tab', 'Tab'),
			{ kind: 'modifier', id: 'ctrl', label: 'Ctrl' },
			{ kind: 'modifier', id: 'alt', label: 'Alt' },
		],
	];
	const normal: KeyDefinition[][] = [
		[
			key('home', 'Home'),
			key('pageUp', 'PgUp'),
			key('delete', 'Del'),
			{ kind: 'spacer', id: 'arrow-gap', label: '' },
			key('arrowUp', '↑'),
			key('backspace', '⌫'),
		],
		[
			key('end', 'End'),
			key('pageDown', 'PgDn'),
			key('insert', 'Ins'),
			key('arrowLeft', '←'),
			key('arrowDown', '↓'),
			key('arrowRight', '→'),
		],
	];
	const rows = computed(() =>
		prefixes.map((prefix, row) => [
			...prefix,
			...(functionPage.value
				? Array.from({ length: 6 }, (_, index) => {
						const number = row * 6 + index + 1;
						return key(`f${number}` as TerminalKey, `F${number}`);
					})
				: normal[row]!),
		]),
	);

	function label(definition: KeyDefinition) {
		if (definition.kind === 'modifier')
			return props.i18n.t('keyboardModifier', {
				name: definition.label,
				state: props.i18n.t('modifierState.' + props.input.modifiers.levels[definition.id]),
			});
		if (definition.kind === 'page') return props.i18n.t('functionKeys');
		return /^f\d+$/.test(definition.id) ? definition.label : props.i18n.t('keys.' + definition.id);
	}

	function click(event: MouseEvent, definition: KeyDefinition) {
		if (!props.active || !props.enabled) return;
		if (definition.kind === 'modifier') props.input.modifiers.toggle(definition.id);
		else if (definition.kind === 'page') {
			stop();
			functionPage.value = !functionPage.value;
		} else if (definition.kind === 'key' && event.detail === 0) props.input.key(definition.id);
	}

	let delay: ReturnType<typeof setTimeout> | undefined, repeat: ReturnType<typeof setInterval> | undefined;

	function stop() {
		clearTimeout(delay);
		clearInterval(repeat);
	}

	function press(event: PointerEvent, key: string) {
		event.preventDefault();
		if (!props.active || !props.enabled || event.button !== 0) return;
		stop();
		props.input.key(key as TerminalKey);
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		if (
			['arrowUp', 'arrowDown', 'arrowLeft', 'arrowRight', 'backspace', 'delete', 'pageUp', 'pageDown'].includes(
				key,
			)
		)
			delay = setTimeout(() => {
				repeat = setInterval(() => props.input.key(key as TerminalKey), 65);
			}, 400);
	}

	watch(
		() => [props.active, props.enabled],
		() => {
			stop();
			if (!props.active || !props.enabled) props.input.modifiers.clear();
		},
	);
	const visibility = useDocumentVisibility();
	watch(visibility, () => {
		stop();
		props.input.modifiers.clear();
	});
	useEventListener(window, 'blur', stop);
	onScopeDispose(stop);
</script>
<template>
	<div class="workspace-keyboard" role="toolbar" :aria-label="i18n.t('keyboard')" @contextmenu.prevent>
		<div v-for="(row, index) in rows" :key="index" class="workspace-keyboard-row">
			<template v-for="definition in row" :key="definition.id">
				<span v-if="definition.kind === 'spacer'" aria-hidden="true" />
				<button
					v-else
					type="button"
					:data-key="definition.id"
					:disabled="!enabled"
					:aria-label="label(definition)"
					:aria-pressed="
						definition.kind === 'modifier'
							? input.modifiers.levels[definition.id] !== 'off'
							: definition.kind === 'page'
								? functionPage
								: undefined
					"
					:data-state="definition.kind === 'modifier' ? input.modifiers.levels[definition.id] : undefined"
					@pointerdown.prevent="definition.kind === 'key' && press($event, definition.id)"
					@pointerup="stop"
					@pointercancel="stop"
					@lostpointercapture="stop"
					@click="click($event, definition)"
				>
					{{ definition.label }}
				</button>
			</template>
		</div>
	</div>
</template>
