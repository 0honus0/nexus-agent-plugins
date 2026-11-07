declare module 'nexus:frontend-sdk' {
	import type { AgentPluginFrontendModule } from '@nexus-terminal/shared/agent/plugins/frontend-sdk';
	export const connectNexusPlugin: AgentPluginFrontendModule['connectNexusPlugin'];
	export const PluginUiRequestFailure: AgentPluginFrontendModule['PluginUiRequestFailure'];
}
