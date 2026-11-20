import { computed, inject, ref, type InjectionKey, type Ref } from 'vue';
import { useInputScale } from '../input/input-scale-api.js';
import type { WorkspacePane } from '../../shared/workspace-layout-types';

export interface PaneMinimum {
	minimumWidth: number;
	minimumHeight: number;
}

export interface PanePresentation {
	id: WorkspacePane;
	scale: { min: number; max: number; step: number };
	/** Physical readability floor; zoom never changes the outer constraints. */
	minimumViewport: PaneMinimum;
}

export const panePresentationKey: InjectionKey<{
	scales: Partial<Record<WorkspacePane, number>>;
	changed(): void;
}> = Symbol('pane-presentation');

/** Pane zoom changes content only. Container queries own responsive geometry;
 * no measured child size, zoom or breakpoint may feed back into Dockview constraints.
 */
export function usePanePresentation(target: Ref<HTMLElement | undefined>, definition: PanePresentation) {
	const host = inject(panePresentationKey, undefined);
	const fallback = ref(1);
	const scale = computed({
		get: () =>
			Math.max(
				definition.scale.min,
				Math.min(definition.scale.max, host?.scales[definition.id] ?? fallback.value),
			),

		set(value: number) {
			const next = Math.max(definition.scale.min, Math.min(definition.scale.max, value));
			if (next === scale.value) return;
			if (host) {
				host.scales[definition.id] = next;
				host.changed();
			} else fallback.value = next;
		},
	});
	useInputScale({ target, value: scale, ...definition.scale, precision: 2 });
	const style = computed(() => ({
		width: `${100 / scale.value}%`,
		height: `${100 / scale.value}%`,
		flex: '0 0 auto',
		transform: `scale(${scale.value})`,
		transformOrigin: 'top left',
	}));
	return { scale, style };
}
