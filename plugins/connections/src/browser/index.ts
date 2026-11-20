import { defineAsyncComponent, defineComponent, h, provide, ref } from 'vue';
import type { PluginApplicationTileProps, PluginModuleApi, PluginWindowProps } from 'nexus-terminal/browser';
import { ConnectionsClient } from './connections-client-api.js';
import { connectionsKey } from './connections-view.js';
import { messages } from './messages.js';
import ConnectionsTile from './ConnectionsTile.vue';
import './connections.css';

export const activate: PluginModuleApi['activate'] = (context) => {
	context.app.log.registerMessages({ en: messages.en.notices, zh: messages.zh.notices });
	const client = new ConnectionsClient(context);
	const label = ref('Connections');

	const stylesheet = document.createElement('link');
	stylesheet.rel = 'stylesheet';
	stylesheet.href = new URL(/* @vite-ignore */ 'index.css', import.meta.url).href;
	document.head.append(stylesheet);
	context.onDispose(() => stylesheet.remove());

	const component = defineAsyncComponent(async () => {
		const { default: App } = await import('./ConnectionsApp.vue');
		context.signal.throwIfAborted();

		return defineComponent({
			props: ['context', 'view'],

			setup(props: PluginWindowProps) {
				provide(connectionsKey, client);
				return () => h(App, { ...props, label });
			},
		});
	});

	// 首屏卡片随贡献一起就绪，窗口组件继续在打开时加载。
	const tile = defineComponent({
		props: ['context', 'view', 'size', 'open'],

		setup(props: PluginApplicationTileProps) {
			return () => h(ConnectionsTile, { ...props, runtime: client, label });
		},
	});

	context.provide('connections', client);
	context.contribute({
		applications: [
			{
				id: 'main',
				label,
				component,
				tile: { component: tile, showAtIconSize: true },
				scrollbarGutter: 'stable',
			},
		],
	});
	context.self.readiness.set({ state: 'ready' });
};
