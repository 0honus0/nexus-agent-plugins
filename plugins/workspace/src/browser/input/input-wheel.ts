/** Shared physical-wheel/trackpad normalization; callers retain their own navigation policy. */
export function wheelPixels(event: WheelEvent, element: HTMLElement) {
	const unit =
		event.deltaMode === 2
			? element.clientHeight
			: event.deltaMode === 1
				? parseFloat(getComputedStyle(element).fontSize) || 16
				: 1;
	return { x: event.deltaX * unit, y: event.deltaY * unit };
}
