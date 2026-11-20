import { defineAsyncComponent, defineComponent, h, onScopeDispose, ref, watchEffect } from 'vue';
import { SquareTerminal } from '@lucide/vue';
import { UiActionCard } from 'nexus-terminal/browser/ui';
import { useI18n } from 'vue-i18n';
import type { PluginApplicationTileProps, PluginModuleApi, PluginWindowProps } from 'nexus-terminal/browser';
import { createWorkspaceI18n, registerWorkspaceNotices } from './workspace-i18n.js';
import { messages } from './messages.js';
import WorkspaceLoading from './WorkspaceLoading.vue';
import 'dockview-vue/dist/styles/dockview.css';
import './workspace.css';

export const activate: PluginModuleApi['activate'] = (context) => {
	registerWorkspaceNotices(context);
	const label = ref<string>(messages.en.title);
	const css = document.createElement('link');
	css.rel = 'stylesheet';
	css.href = new URL(/* @vite-ignore */ 'index.css', import.meta.url).href;
	document.head.append(css);
	context.onDispose(() => css.remove());

	let appModule: Promise<typeof import('./WorkspaceApp.vue')> | undefined;

	function preload() {
		context.signal.throwIfAborted();
		return (appModule ??= import('./WorkspaceApp.vue').catch((cause: unknown) => {
			appModule = undefined;
			throw cause;
		}));
	}

	const component = defineAsyncComponent({
		async loader() {
			const { default: App } = await preload();
			context.signal.throwIfAborted();
			return defineComponent({
				props: ['context', 'view'],

				setup(props: PluginWindowProps) {
					const { locale } = useI18n({ useScope: 'global' });
					const i18n = createWorkspaceI18n(locale);
					watchEffect(() => (label.value = i18n.title.value));
					onScopeDispose(i18n.dispose);
					return () => h(App, { ...props, ctx: context, i18n });
				},
			});
		},

		loadingComponent: WorkspaceLoading,
		delay: 0,
	});
	const tile = defineComponent({
		props: ['context', 'view', 'open', 'size'],

		setup(props: PluginApplicationTileProps) {
			return () =>
				h(UiActionCard, { label: label.value, class: 'workspace-desktop-tile', onClick: props.open }, () => [
					h(SquareTerminal, { size: 28, 'aria-hidden': 'true' }),
					h('span', label.value),
				]);
		},
	});

	const application = {
		id: 'main',
		label,
		component,
		scrollMode: 'content',
		tile: { component: tile, showAtIconSize: true },
	} as const;
	// 旧宿主可能没有预加载或图标字段。校验失败的贡献尚未登记。
	for (const candidate of [
		{ ...application, icon: SquareTerminal, preload },
		{ ...application, icon: SquareTerminal },
	]) {
		try {
			context.contribute({ applications: [candidate] });
		} catch (cause) {
			if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'PLUGIN_CONTRIBUTIONS_INVALID')
				throw cause;
			continue;
		}
		context.self.readiness.set({ state: 'ready' });
		return;
	}
	context.contribute({ applications: [application] });
	context.self.readiness.set({ state: 'ready' });
};
