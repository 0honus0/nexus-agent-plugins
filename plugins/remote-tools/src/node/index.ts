import type { PluginModuleApi } from 'nexus-terminal/node';
import type {} from '@nexus-terminal/ssh/ssh-api';
import { RemoteTools } from './remote-tools-api.js';

export const activate: PluginModuleApi['activate'] = (context) => {
	context.use({ ssh: ['@nexus-terminal/ssh', 'ssh'] }, (scope) => {
		const tools = new RemoteTools(scope);
		scope.provide('remoteTools', tools);
		context.self.readiness.set({ state: 'ready' });
	});
};
