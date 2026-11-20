import { ShieldCheck } from '@lucide/vue';
import type { PluginModuleApi } from 'nexus-terminal/browser';
import { defineAsyncComponent } from 'vue';
import { messages, notices } from './messages.js';
import { reportOidcFailure, signInWithOidc } from './oidc-client-api.js';

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
				label: messages.en.title,
				component: defineAsyncComponent(() => import('./OidcApp.vue')),
				scrollMode: 'window',
			},
		],
		login: [
			{
				id: 'oidc',
				label: 'OpenID Connect',
				icon: ShieldCheck,

				async start(action) {
					try {
						await signInWithOidc(action);
					} catch (cause) {
						reportOidcFailure(context, cause, action.signal);
					}
				},
			},
		],
	});
	context.self.readiness.set({ state: 'ready' });
	const url = new URL(location.href);
	if (url.pathname === '/login' && url.searchParams.get('oidc') === 'failed') {
		url.searchParams.delete('oidc');
		history.replaceState(history.state, '', url);
		reportOidcFailure(context, new Error('OIDC_LOGIN_FAILED'));
	}
};
