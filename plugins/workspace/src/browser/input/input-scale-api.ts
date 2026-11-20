import { useEventListener } from '@vueuse/core';
import { toValue } from 'vue';
import type { InputScaleOptions } from './input-types';
import { wheelPixels } from './input-wheel';

export interface InputScaleApi {
	setScale(value: number): void;
	beginPinch(): void;
	pinch(ratio: number): void;
}

/** Local scaling only; ordinary wheel events remain owned by the embedded application. */
export function useInputScale(options: InputScaleOptions): InputScaleApi {
	let amount = 0,
		last = 0,
		baseline = options.value.value;

	function setScale(value: number) {
		if (!Number.isFinite(value) || options.enabled?.() === false) return;
		const next = Number(Math.max(options.min, Math.min(options.max, value)).toFixed(options.precision ?? 0));
		if (next === options.value.value) return;
		options.value.value = next;
		options.onChange?.(next);
	}

	useEventListener(
		options.target,
		'wheel',
		(event) => {
			if (!event.ctrlKey || options.enabled?.() === false) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			const target = toValue(options.target);
			if (!target) return;
			const delta = wheelPixels(event, target).y;
			if (!Number.isFinite(delta) || !delta) return;
			const now = performance.now();
			if (now - last > 220 || Math.sign(delta) !== Math.sign(amount)) amount = 0;
			last = now;
			amount += delta;
			const steps = Math.floor(Math.abs(amount) / 72);
			if (!steps) return;
			const direction = Math.sign(amount);
			amount -= direction * steps * 72;
			setScale(options.value.value - direction * Math.min(3, steps) * (options.step ?? 1));
		},
		{ capture: true, passive: false },
	);
	return {
		setScale,

		beginPinch() {
			baseline = options.value.value;
		},

		pinch(ratio) {
			setScale(baseline * ratio);
		},
	};
}
