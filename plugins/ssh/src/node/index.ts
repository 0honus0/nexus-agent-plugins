import type { PluginModuleApi } from 'nexus-terminal/node';
import { Ssh } from './ssh-api.js';

export const activate: PluginModuleApi['activate'] = (context) => {
	const ssh = new Ssh(context.signal, context.app.log);
	context.onDispose(() => ssh.close());
	context.provide('ssh', ssh);
	context.self.readiness.set({ state: 'ready' });
};
