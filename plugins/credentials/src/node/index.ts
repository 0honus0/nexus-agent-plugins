import type { PluginModuleApi } from 'nexus-terminal/node';
import { CredentialsRevisionSchema } from '../shared/credentials-types.js';
import { Credentials } from './credentials-api.js';
import { registerCredentialsHttp } from './credentials-http.js';

export { backup, migrations } from './credentials-storage.js';

export const activate: PluginModuleApi['activate'] = (context) => {
	context.use({ ssh: ['@nexus-terminal/ssh', 'ssh'] }, (scope) => {
		const revisions = context.app.state.register({
			name: 'credentials',
			schema: CredentialsRevisionSchema,
			initial: { revision: 0 },
			lifetime: scope,
		});
		const service = new Credentials(context.app, scope.plugin.ssh, scope.signal, (revision) =>
			revisions.publish({ revision }),
		);
		registerCredentialsHttp(context.app, service, scope);
		scope.provide('credentials', service);
		context.self.readiness.set({ state: 'ready' });
	});
};
