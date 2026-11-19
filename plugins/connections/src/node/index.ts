import type { PluginModuleApi } from 'nexus-terminal/node';
import { ConnectionsRevisionSchema } from '../shared/connection-types.js';
import { Connections } from './connections-api.js';
import { registerConnectionsHttp } from './connections-http.js';

export { backup, migrations } from './connections-sql.js';

export const activate: PluginModuleApi['activate'] = (context) => {
	context.use({ credentials: ['@nexus-terminal/credentials', 'credentials'] }, (scope) => {
		const revisions = context.app.state.register({
			name: 'connections',
			schema: ConnectionsRevisionSchema,
			initial: { revision: 0 },
			lifetime: scope,
		});
		const service = new Connections(context.app.database, scope.plugin.credentials, scope.signal, (revision) =>
			revisions.publish({ revision }),
		);
		registerConnectionsHttp(context.app, service, scope);
		scope.provide('connections', service);
		context.self.readiness.set({ state: 'ready' });
	});
};
