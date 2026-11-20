import { effectScope, ref } from 'vue';
import type { PluginContextApi, PluginWindowApi } from 'nexus-terminal/browser';
import { expect, it } from 'vitest';
import { useWorkspaceSessions } from '../src/browser/use-workspace-sessions';

it('clears the catalog when an older host invalidates Connections before notifying consumers', () => {
	const dependency = new AbortController();
	const loaded = ref(true);
	const catalog = ref({ connections: [] });
	let valid = true;

	function assertLive() {
		if (!valid) throw Object.assign(new Error('Service expired'), { code: 'PLUGIN_SERVICE_EXPIRED' });
	}

	const client = {
		get loaded() {
			assertLive();
			return loaded;
		},

		get catalog() {
			assertLive();
			return catalog;
		},

		async refresh() {},
	};
	const dispose = new Set<() => void>();
	const scope = effectScope();
	const model = scope.run(() =>
		useWorkspaceSessions({
			ctx: {
				signal: new AbortController().signal,
				app: { state: { subscribe: () => () => {} } },

				use(_selection: unknown, bind: (context: object) => void) {
					bind({
						signal: dependency.signal,
						plugin: { connections: client },
						onDispose: dispose.add.bind(dispose),
					});
					return () => {};
				},
			} as unknown as PluginContextApi,
			view: {
				signal: new AbortController().signal,

				onBeforeClose: () => () => {},

				onDispose: () => () => {},
			} as unknown as PluginWindowApi,
		}),
	)!;

	try {
		expect(model.connectionsLoaded.value).toBe(true);
		valid = false;
		loaded.value = false;
		catalog.value = { connections: [] };
		expect(model.connectionsLoaded.value).toBe(false);
		expect(model.savedConnections.value).toEqual([]);

		dependency.abort();
		expect(model.connections.value).toBeUndefined();
	} finally {
		for (const cleanup of dispose) cleanup();
		scope.stop();
	}
});
