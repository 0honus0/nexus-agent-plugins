import { useDocumentVisibility, useEventListener } from '@vueuse/core';
import { onScopeDispose, readonly, ref, toValue, watch } from 'vue';
import type { DeepReadonly, Ref } from 'vue';
import type { InputGestureKind, InputGestureOptions, InputPoint } from './input-types';

export interface InputGestureApi {
	readonly state: DeepReadonly<Ref<InputGestureKind>>;
	cancel(): void;
}

/** One touch owner: a pinch never falls back to a tap/pan until every finger is lifted. */
export function useInputGestures(options: InputGestureOptions): InputGestureApi {
	const state = ref<InputGestureKind>('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let origin: InputPoint = { x: 0, y: 0 },
		previous = origin,
		distance = 0;
	let suppressClickUntil = 0;

	const point = (touch: Touch): InputPoint => ({ x: touch.clientX, y: touch.clientY });

	const span = (touches: TouchList) =>
		Math.hypot(touches[1]!.clientX - touches[0]!.clientX, touches[1]!.clientY - touches[0]!.clientY);

	const clear = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	function cancel() {
		clear();
		if (state.value !== 'idle') options.onEnd?.(state.value, previous, true);
		state.value = 'idle';
		distance = 0;
	}

	const consume = (event: Event) => {
		if (event.cancelable) event.preventDefault();
		event.stopImmediatePropagation();
	};

	useEventListener(
		options.target,
		'touchstart',
		(event) => {
			if (options.enabled?.() === false) return;
			consume(event);
			clear();
			suppressClickUntil = Date.now() + 1000;
			if (event.touches.length === 1 && state.value === 'idle') {
				origin = previous = point(event.touches[0]!);
				state.value = 'press';
				options.onStart?.(origin);
				timer = setTimeout(() => {
					if (state.value === 'press') {
						state.value = 'hold';
						options.onHold?.(previous);
					}
				}, options.holdDelay ?? 520);
			} else if (event.touches.length === 2 && state.value !== 'blocked') {
				state.value = 'pinch';
				distance = span(event.touches);
				options.onPinchStart?.();
			} else state.value = 'blocked';
		},
		{ capture: true, passive: false },
	);
	useEventListener(
		options.target,
		'touchmove',
		(event) => {
			if (state.value === 'idle') return;
			consume(event);
			if (state.value === 'pinch' && event.touches.length === 2 && distance > 0) {
				options.onPinch?.(span(event.touches) / distance);
				return;
			}
			if (event.touches.length !== 1 || state.value === 'pinch' || state.value === 'blocked') return;
			const next = point(event.touches[0]!);
			if (
				state.value === 'press' &&
				Math.hypot(next.x - origin.x, next.y - origin.y) > (options.moveTolerance ?? 12)
			) {
				clear();
				state.value = 'pan';
			}
			if (state.value === 'pan') options.onPan?.(next, { x: next.x - previous.x, y: next.y - previous.y });
			if (state.value === 'hold') options.onHoldMove?.(next);
			previous = next;
		},
		{ capture: true, passive: false },
	);

	function finish(event: TouchEvent) {
		if (state.value === 'idle') return;
		consume(event);
		clear();
		suppressClickUntil = Date.now() + 800;
		if (event.touches.length && event.type !== 'touchcancel') {
			state.value = 'blocked';
			return;
		}
		const kind = state.value,
			canceled = event.type === 'touchcancel';
		state.value = 'idle';
		if (kind === 'press' && !canceled) options.onTap?.(previous);
		options.onEnd?.(kind, previous, canceled);
	}

	useEventListener(options.target, ['touchend', 'touchcancel'], finish, {
		capture: true,
		passive: false,
	});
	useEventListener(
		options.target,
		'click',
		(event) => {
			if (event.detail !== 0 && Date.now() < suppressClickUntil) consume(event);
		},
		{ capture: true },
	);
	useEventListener(window, 'blur', cancel);
	watch(useDocumentVisibility(), (value) => {
		if (value !== 'visible') cancel();
	});
	watch(
		() => options.enabled?.(),
		(value) => {
			if (value === false) cancel();
		},
	);
	watch(() => toValue(options.target), cancel);
	onScopeDispose(cancel);
	return { state: readonly(state), cancel };
}
