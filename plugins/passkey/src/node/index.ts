import type { PluginModuleApi } from 'nexus-terminal/node';
import { registerPasskeyHttp } from './passkey-http.js';
import { PasskeyService } from './passkey-service.js';

export { backup, migrations } from './passkey-storage.js';

export const activate: PluginModuleApi['activate'] = async (context) => {
	const service = new PasskeyService(context);
	registerPasskeyHttp(context, service);
	await service.refreshReadiness();
};
