import { onScopeDispose, shallowReactive, type InjectionKey } from 'vue';
import type { LayoutProfile } from '../../shared/layout-types.js';
import type { PluginContextApi } from 'nexus-terminal/browser';
import { WorkspaceLayoutResponseSchema, type WorkspaceLayout } from '../../shared/workspace-layout-types';
import { createWorkspaceClient } from '../workspace-client';

/** One layout per width profile, shared by all windows in this plugin generation. */
function createLayoutState(ctx: PluginContextApi) {
	const { request, report } = createWorkspaceClient(ctx, ctx.signal);
	const values = shallowReactive(new Map<LayoutProfile, { value: WorkspaceLayout; owner?: symbol }>());
	const reads = new Map<LayoutProfile, Promise<void>>();
	const pending = new Map<LayoutProfile, WorkspaceLayout>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let saving = Promise.resolve();

	async function load(profile: LayoutProfile) {
		if (values.has(profile)) return;
		let reading = reads.get(profile);
		if (!reading) {
			reading = (async () => {
				try {
					const { layout: raw } = await request(
						'layouts/' + profile,
						undefined,
						undefined,
						WorkspaceLayoutResponseSchema,
					);
					if (!ctx.signal.aborted && raw && !values.has(profile)) values.set(profile, { value: raw });
				} catch (cause) {
					report(cause);
				} finally {
					reads.delete(profile);
				}
			})();
			reads.set(profile, reading);
		}
		await reading;
	}

	function update(profile: LayoutProfile, value: WorkspaceLayout, owner: symbol) {
		if (ctx.signal.aborted || JSON.stringify(values.get(profile)?.value) === JSON.stringify(value)) return;
		values.set(profile, { value, owner });
		pending.set(profile, value);
		clearTimeout(timer);
		timer = setTimeout(() => ctx.app.tasks.background('save-workspace-layout', flush), 350);
	}

	function flush() {
		clearTimeout(timer);
		if (!pending.size) return saving;
		const batch = [...pending];
		pending.clear();
		saving = saving.then(async () => {
			for (const [profile, value] of batch) {
				try {
					await request('layouts/' + profile, 'PUT', value);
				} catch (cause) {
					report(cause);
					if (ctx.signal.aborted) continue;
					// A lost response may conceal a committed write. Read back instead of
					// replaying it or letting a rejected cache shadow future window loads.
					try {
						const { layout: raw } = await request(
							'layouts/' + profile,
							undefined,
							undefined,
							WorkspaceLayoutResponseSchema,
						);
						if (ctx.signal.aborted || values.get(profile)?.value !== value) continue;
						if (raw) values.set(profile, { value: raw });
						else values.delete(profile);
					} catch (readError) {
						if (!ctx.signal.aborted) {
							report(readError);
							if (values.get(profile)?.value === value) values.delete(profile);
						}
					}
				}
			}
		});
		return saving;
	}

	ctx.signal.addEventListener(
		'abort',
		() => {
			clearTimeout(timer);
			pending.clear();
		},
		{ once: true },
	);
	return { values, load, update, flush };
}

const layouts = new WeakMap<PluginContextApi, ReturnType<typeof createLayoutState>>();

/** All windows use one write queue; reopening cannot race an old window's final save. */
export function createWorkspaceLayoutState(ctx: PluginContextApi) {
	let shared = layouts.get(ctx);
	if (!shared) {
		shared = createLayoutState(ctx);
		layouts.set(ctx, shared);
		ctx.onDispose(() => {
			layouts.delete(ctx);
		});
	}
	const state = shared;
	onScopeDispose(() => ctx.app.tasks.background('save-workspace-layout', state.flush));
	return state;
}

export const workspaceLayoutStateKey: InjectionKey<ReturnType<typeof createWorkspaceLayoutState>> =
	Symbol('workspace-layouts');
