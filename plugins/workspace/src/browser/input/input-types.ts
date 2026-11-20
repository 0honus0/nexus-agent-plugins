import type { MaybeRefOrGetter, Ref } from 'vue';

export type InputPoint = { x: number; y: number };

export type InputGestureKind = 'idle' | 'press' | 'pan' | 'hold' | 'pinch' | 'blocked';

export interface InputGestureOptions {
	target: MaybeRefOrGetter<HTMLElement | undefined>;
	enabled?: () => boolean;
	holdDelay?: number;
	moveTolerance?: number;
	onStart?: (point: InputPoint) => void;
	onTap?: (point: InputPoint) => void;
	onPan?: (point: InputPoint, delta: InputPoint) => void;
	onHold?: (point: InputPoint) => void;
	onHoldMove?: (point: InputPoint) => void;
	onPinchStart?: () => void;
	onPinch?: (ratio: number) => void;
	onEnd?: (kind: InputGestureKind, point: InputPoint, canceled: boolean) => void;
}

export interface InputScaleOptions {
	target: MaybeRefOrGetter<HTMLElement | undefined>;
	value: Ref<number>;
	min: number;
	max: number;
	step?: number;
	precision?: number;
	enabled?: () => boolean;
	onChange?: (value: number) => void;
}
