import { computed, type Ref } from 'vue';
import { createI18n } from 'vue-i18n';
import type { PluginContextApi } from 'nexus-terminal/browser';
import { messages } from './messages.js';

function notices(errors: Record<string, unknown>): Record<string, string> {
	return Object.fromEntries(
		Object.entries(errors).filter(
			(entry): entry is [string, string] => typeof entry[1] === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(entry[0]),
		),
	);
}

export function registerWorkspaceNotices(ctx: PluginContextApi): void {
	const unregister = ctx.app.log.registerMessages({
		en: notices(messages.en.errors),
		zh: notices(messages['zh-CN'].errors),
	});
	ctx.onDispose(unregister);
}

export function createWorkspaceI18n(locale: Readonly<Ref<string>>) {
	const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages });
	const language = computed(() => (locale.value.startsWith('zh') ? 'zh-CN' : 'en'));

	const t = (key: string, params: Record<string, string | number> = {}) =>
		i18n.global.t(key, params, { locale: language.value });

	return {
		t,

		n: (value: number) => i18n.global.n(value, { locale: language.value }),

		title: computed(() => t('title')),

		dispose: () => i18n.dispose(),
	};
}

export type WorkspaceI18n = ReturnType<typeof createWorkspaceI18n>;
