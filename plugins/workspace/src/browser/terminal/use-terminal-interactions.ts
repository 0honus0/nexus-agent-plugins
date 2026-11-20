import { onMounted, onScopeDispose, ref, watch, type Ref } from 'vue';
import { useClipboard, useEventListener, useResizeObserver, useDocumentVisibility } from '@vueuse/core';
import { useInputScale } from '../input/input-scale-api.js';
import { useInputGestures } from '../input/input-gesture-api.js';
import type { Terminal } from '@xterm/xterm';
import { createTerminalSelection } from './terminal-selection';
type Point = { x: number; y: number };

export function useTerminalInteractions(options: {
	root: Ref<HTMLElement | undefined>;
	frame: Ref<HTMLElement | undefined>;
	terminal(): Terminal | undefined;
	active(): boolean;
	canInput(): boolean;
	fontSize?(): number;
	resize(): void;
	onPaste?(): void;
	report(code: string): void;
}) {
	const size = ref(options.fontSize?.() ?? 13),
		menu = ref<Point>(),
		selected = ref(false);
	const selection = createTerminalSelection(options.terminal, () => options.frame.value);
	const { copy: writeClipboard } = useClipboard({ legacy: true });
	let keyboard: { readOnly: boolean; mode: string | null } | undefined;
	let generation = 0,
		touchUntil = 0,
		remainder = 0,
		frame = 0;
	let drag: { pointer: number; anchor: number; element: HTMLElement; point: Point } | undefined;
	let extending: Point | undefined;

	const remoteMouse = () => options.terminal()?.modes.mouseTrackingMode !== 'none';

	function suppressKeyboard() {
		const t = options.terminal(),
			textarea = t?.textarea;
		if (!textarea) return;
		keyboard ??= { readOnly: textarea.readOnly, mode: textarea.getAttribute('inputmode') };
		textarea.readOnly = true;
		textarea.setAttribute('inputmode', 'none');
		t?.blur();
	}

	function restoreKeyboard(focus = false) {
		const t = options.terminal(),
			textarea = t?.textarea;
		if (textarea && keyboard) {
			textarea.readOnly = keyboard.readOnly;
			if (keyboard.mode === null) textarea.removeAttribute('inputmode');
			else textarea.setAttribute('inputmode', keyboard.mode);
		}
		keyboard = undefined;
		if (focus && options.active() && options.canInput()) t?.focus();
	}

	function close(clear = true) {
		menu.value = undefined;
		if (clear) selection.clear();
		restoreKeyboard();
	}

	function showMenu() {
		const box = options.frame.value?.getBoundingClientRect();
		if (!box) return;
		menu.value = { x: box.width / 2, y: Math.min(40, box.height / 2) };
		selected.value = !!options.terminal()?.hasSelection();
	}

	async function copy() {
		const text = options.terminal()?.getSelection();
		if (!text) return;
		const revision = generation;
		try {
			// Preserve permission failures instead of treating a failed legacy copy as success.
			if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
			else await writeClipboard(text);
			if (revision === generation) close();
		} catch {
			if (revision === generation) options.report('WORKSPACE_CLIPBOARD_WRITE_FAILED');
		}
	}

	async function paste() {
		if (!options.canInput()) return;
		const revision = generation;
		try {
			const value = await navigator.clipboard.readText();
			if (revision !== generation || !options.active() || !options.canInput()) return;
			close();
			options.onPaste?.();
			options.terminal()?.paste(value);
			restoreKeyboard(true);
		} catch {
			if (revision === generation) options.report('WORKSPACE_CLIPBOARD_READ_FAILED');
		}
	}

	const scale = useInputScale({
		target: options.root,
		value: size,
		min: 8,
		max: 40,
		enabled: options.active,

		onChange() {
			selection.clear();
			menu.value = undefined;
			options.resize();
		},
	});

	function scroll(point: Point, pixels: number) {
		const t = options.terminal(),
			screen = t?.element?.querySelector('.xterm-screen');
		if (!t || !screen) return;
		const height = screen.getBoundingClientRect().height / t.rows;
		if (!height) return;
		remainder += pixels;
		const lines = Math.trunc(remainder / height);
		remainder -= lines * height;
		if (!lines) return;
		if (remoteMouse() || t.buffer.active.type === 'alternate') {
			for (let i = 0; i < Math.min(40, Math.abs(lines)); i++)
				t.element?.dispatchEvent(
					new WheelEvent('wheel', {
						bubbles: true,
						cancelable: true,
						clientX: point.x,
						clientY: point.y,
						deltaMode: 1,
						deltaY: Math.sign(lines),
					}),
				);
		} else t.scrollLines(lines);
	}

	function edgeScroll() {
		cancelAnimationFrame(frame);
		const point = drag?.point ?? extending,
			t = options.terminal();
		if (!point || !t || !options.active()) return;
		const box = t.element?.querySelector('.xterm-screen')?.getBoundingClientRect();
		if (box && t.buffer.active.type === 'normal') {
			const lines = point.y < box.top + 12 ? -1 : point.y > box.bottom - 12 ? 1 : 0;
			if (lines) {
				t.scrollLines(lines);
				selection.extend(point, drag?.anchor);
			}
		}
		frame = requestAnimationFrame(edgeScroll);
	}

	const gestures = useInputGestures({
		target: options.root,
		enabled: options.active,

		onStart() {
			touchUntil = Date.now() + 1500;
			close();
			remainder = 0;
			if (document.activeElement !== options.terminal()?.textarea) suppressKeyboard();
		},

		onTap() {
			close();
			restoreKeyboard(true);
		},

		onPan(point, delta) {
			scroll(point, -delta.y);
		},

		onHold(point) {
			suppressKeyboard();
			selection.word(point);
			extending = point;
			edgeScroll();
		},

		onHoldMove(point) {
			extending = point;
			selection.extend(point);
		},

		onPinchStart() {
			extending = undefined;
			cancelAnimationFrame(frame);
			close();
			suppressKeyboard();
			scale.beginPinch();
		},

		onPinch: scale.pinch,

		onEnd(kind, _point, canceled) {
			touchUntil = Date.now() + 800;
			extending = undefined;
			cancelAnimationFrame(frame);
			if (!canceled && kind === 'hold') {
				selection.sync();
				showMenu();
			} else if (kind !== 'press' || canceled) close();
		},
	});

	function endDrag(event?: PointerEvent) {
		const current = drag;
		if (!current || (event && current.pointer !== event.pointerId)) return;
		drag = undefined;
		cancelAnimationFrame(frame);
		if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer);
		if (event?.type === 'pointerup') showMenu();
	}

	function startHandle(handle: 'start' | 'end', event: PointerEvent) {
		const anchor = selection.anchor(handle);
		if (anchor === undefined) return;
		event.preventDefault();
		event.stopPropagation();
		suppressKeyboard();
		menu.value = undefined;
		const element = event.currentTarget as HTMLElement;
		drag = {
			pointer: event.pointerId,
			anchor,
			element,
			point: { x: event.clientX, y: event.clientY },
		};
		element.setPointerCapture(event.pointerId);
		edgeScroll();
	}

	useEventListener(
		window,
		'pointermove',
		(event) => {
			if (drag?.pointer === event.pointerId) {
				event.preventDefault();
				drag.point = { x: event.clientX, y: event.clientY };
				selection.extend(drag.point, drag.anchor);
			}
		},
		{ passive: false },
	);
	useEventListener(window, ['pointerup', 'pointercancel'], endDrag);
	useEventListener(document, 'pointerdown', (event) => {
		if (event.target instanceof Node && options.frame.value?.contains(event.target)) return;
		close();
	});
	useEventListener(
		options.root,
		'mousedown',
		(event) => {
			if (event.button === 2 && (!remoteMouse() || event.shiftKey)) {
				event.preventDefault();
				event.stopImmediatePropagation();
			}
		},
		{ capture: true },
	);
	useEventListener(options.root, 'contextmenu', (event) => {
		if (!options.active()) return;
		event.preventDefault();
		if (Date.now() < touchUntil) return;
		if (remoteMouse() && !event.shiftKey) return;
		if (options.terminal()?.hasSelection()) void copy();
		else void paste();
	});

	function reset() {
		generation++;
		gestures.cancel();
		endDrag();
		extending = undefined;
		cancelAnimationFrame(frame);
		close();
	}

	watch(options.active, (active) => {
		if (!active) {
			reset();
			options.terminal()?.blur();
		}
	});
	watch(useDocumentVisibility(), (state) => {
		if (state !== 'visible') reset();
	});
	useEventListener(window, 'blur', reset);
	useResizeObserver(options.frame, () => selection.sync());
	onMounted(() => {
		const t = options.terminal();
		if (!t) return;
		const changes = t.onSelectionChange(() => {
			selected.value = t.hasSelection();
			selection.sync();
		});
		const scrolling = t.onScroll(selection.sync);
		t.attachCustomKeyEventHandler((event) => {
			if (event.type !== 'keydown' || event.altKey) return true;
			const key = event.key.toLowerCase(),
				shortcut = event.metaKey || (event.ctrlKey && event.shiftKey);
			if (key === 'c' && shortcut) {
				event.preventDefault();
				void copy();
				return false;
			}
			if (key === 'v' && event.ctrlKey && event.shiftKey) {
				event.preventDefault();
				void paste();
				return false;
			}
			return true;
		});
		disposers.push(
			() => changes.dispose(),
			() => scrolling.dispose(),
		);
	});
	const disposers: (() => void)[] = [];
	onScopeDispose(() => {
		reset();
		disposers.forEach((dispose) => dispose());
	});
	return {
		size,
		menu,
		selected,
		handles: selection.handles,
		copy,
		paste,
		close,
		startHandle,

		selectAll() {
			selection.all();
			showMenu();
		},

		canPaste: options.canInput,
	};
}
