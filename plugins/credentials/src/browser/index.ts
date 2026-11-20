import { defineAsyncComponent, defineComponent, h } from 'vue';
import type { PluginModuleApi, PluginWindowProps } from 'nexus-terminal/browser';
import { CredentialsClient } from './credentials-client-api.js';
import { messages } from './messages.js';
import './credentials.css';

export const activate: PluginModuleApi['activate'] = (context) => {
	context.app.log.registerMessages({ en: messages.en.notices, zh: messages.zh.notices });
	const client = new CredentialsClient(context);
	const titles = new Map(Object.entries(messages).map(([language, { title }]) => [language, title]));

	const style = document.createElement('link');
	style.rel = 'stylesheet';
	style.href = new URL(/* @vite-ignore */ 'index.css', import.meta.url).href;
	document.head.append(style);
	context.onDispose(() => style.remove());

	const component = defineAsyncComponent(async () => {
		const { default: App } = await import('./CredentialsApp.vue');
		context.signal.throwIfAborted();
		return defineComponent({
			props: ['context', 'view'],

			setup(props: PluginWindowProps) {
				return () => h(App, { ...props, runtime: client });
			},
		});
	});
	context.provide('credentials', client);
	context.contribute({
		applications: [
			{
				id: 'main',

				label: (locale?: string) =>
					(locale === undefined ? undefined : titles.get(locale)) ?? messages.en.title,

				component,
				scrollbarGutter: 'stable',
			},
		],
	});
	context.self.readiness.set({ state: 'ready' });
};
