import { createApp, watch } from 'vue';
import { createI18n, type LocaleMessages, type VueMessageType } from 'vue-i18n';
import { connectNexusPlugin } from 'nexus:frontend-sdk';
import { createPlatform } from '@/platform/client';
import { installAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
import { installUiTranslator } from '@/shared/i18n/public';
import ChatUi from '@/platform/ChatUi.vue';
import '@/platform/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@/platform/surface.css';

const sdk = await connectNexusPlugin();
await sdk.ui.ready;
const platform = createPlatform(sdk);
installAgentChatUiPlatform(platform);
const i18n = createI18n({
	legacy: false,
	locale: platform.environment.value.locale,
	fallbackLocale: 'en-US',
	messages: {},
});
const catalogs = import.meta.glob<LocaleMessages<VueMessageType>>(
	'../{app/i18n/messages,features/agent/i18n,features/filesystem/i18n,shared/*/i18n}/*.json',
	{ eager: true, import: 'default' },
);
for (const [path, raw] of Object.entries(catalogs)) {
	const locale = path
		.split('/')
		.at(-1)
		?.replace(/\.json$/u, '');
	if (!locale || raw === null || typeof raw !== 'object' || Array.isArray(raw))
		throw new Error('Invalid packaged chat translations');
	i18n.global.mergeLocaleMessage(locale, raw);
}
installUiTranslator((key, parameters) => (parameters ? i18n.global.t(key, parameters) : i18n.global.t(key)));
watch(
	platform.environment,
	(value, previous) => {
		i18n.global.locale.value = value.locale;
		document.documentElement.classList.toggle('dark', value.dark);
		document.getElementById('app')?.toggleAttribute('data-hub-compact', value.compact);
		for (const variable of previous?.themeVariables ?? [])
			document.documentElement.style.removeProperty(variable.name);
		for (const variable of value.themeVariables)
			document.documentElement.style.setProperty(variable.name, variable.value);
	},
	{ immediate: true },
);
const app = createApp(ChatUi);
app.use(i18n);
app.mount('#app');
window.addEventListener(
	'pagehide',
	() => {
		app.unmount();
		platform.dispose();
		void sdk.close();
	},
	{ once: true },
);
