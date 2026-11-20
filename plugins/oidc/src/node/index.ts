import type { PluginModuleApi } from 'nexus-terminal/node';
import { registerOidcHttp } from './oidc-http.js';
import { OidcService } from './oidc-service.js';

export { backup, migrations } from './oidc-storage.js';

export const activate: PluginModuleApi['activate'] = async (context) => {
	const service = new OidcService(context);
	registerOidcHttp(context, service);
	await service.initialize();
};
