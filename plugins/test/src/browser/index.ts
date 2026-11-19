import type { PluginModuleApi } from 'nexus-terminal/browser';
import type { UiTheme } from 'nexus-terminal/browser/ui';
import { h, ref } from 'vue';
import type {} from '../sdk-fixture-types.js';
import SdkPanel from './SdkPanel.vue';
import UiGallery from './UiGallery.vue';

export const providerValue = ref('unavailable');

const theme = {
	id: 'fixture',
	label: 'SDK fixture theme',
	mode: 'dark',
	tokens: { '--ui-primary': '#123456' },
} satisfies UiTheme;

function testWidget() {
	return h('p', 'Widget ' + providerValue.value);
}

export const activate: PluginModuleApi['activate'] = (context) => {
	context.onDispose(() => {
		document.documentElement.dataset.sdkPhase = 'disposed';
	});
	context.use({ fixture: ['@nexus-terminal/test-provider', 'fixture'] }, (scope) => {
		providerValue.value = scope.plugin.fixture.read();
		scope.onDispose(() => {
			providerValue.value = 'unavailable';
			document.documentElement.dataset.sdkDependency = 'disposed';
		});
	});

	context.contribute({
		applications: [
			{ id: 'sdk', label: 'SDK probes', component: SdkPanel, defaultWindowSize: { width: 640, height: 480 } },
			{ id: 'gallery', label: 'SDK UI gallery', component: UiGallery, scrollMode: 'window' },
		],
		widgets: [{ id: 'fixture', label: 'SDK fixture widget', component: testWidget }],
		themes: [theme],
	});
	context.self.readiness.set({ state: 'ready' });
	document.documentElement.dataset.sdkPhase = 'active';
};

export const deactivate: PluginModuleApi['deactivate'] = (context) => {
	if (!context.signal.aborted) throw new Error('SDK_TEST_BROWSER_NOT_CANCELLED');
	document.documentElement.dataset.sdkDeactivate = 'called';
};
