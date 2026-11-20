import { Fingerprint } from '@lucide/vue';
import type { PluginModuleApi } from 'nexus-terminal/browser';
import { defineAsyncComponent } from 'vue';
import { messages, notices } from './messages.js';

export const activate: PluginModuleApi['activate'] = (context) => {
	context.onDispose(context.app.log.registerMessages(notices));
	const stylesheet = document.createElement('link');
	stylesheet.rel = 'stylesheet';
	stylesheet.href = new URL(/* @vite-ignore */ 'index.css', import.meta.url).href;
	document.head.append(stylesheet);
	context.onDispose(() => stylesheet.remove());
	context.contribute({
		applications: [
			{
				id: 'main',

				label: (locale) => (locale?.startsWith('zh') ? messages.zh.title : messages.en.title),

				component: defineAsyncComponent(() => import('./PasskeyApp.vue')),
				scrollMode: 'window',
			},
		],
		login: [
			{
				id: 'passkey',
				label: 'Passkey',
				icon: Fingerprint,

				async start(action) {
					const { signInWithPasskey, reportPasskeyFailure } = await import('./passkey-client-api.js');
					try {
						await signInWithPasskey(action);
					} catch (cause) {
						reportPasskeyFailure(context, cause, action.signal);
					}
				},
			},
		],
	});
	context.self.readiness.set({ state: 'ready' });
};
