import type { PluginModuleApi } from 'nexus-terminal/node';
import type {} from '@nexus-terminal/ssh/ssh-api';
import type {} from '@nexus-terminal/remote-tools/remote-tools-api';
import type {} from '@nexus-terminal/connections/connections-api';
import type {} from '@nexus-terminal/credentials/credentials-api';
import { SessionListResponseSchema, WorkspaceSessionsTopic } from '../shared/workspace-types.js';
import { WorkspaceService } from './workspace-service.js';
import { WorkspaceBackgroundStorage } from './workspace-background-storage.js';
import { WorkspaceCatalogStorage } from './workspace-catalog-storage.js';
import { WorkspaceLayoutStorage } from './workspace-layout-storage.js';
import { registerWorkspaceAppearanceHttp } from './workspace-background-http.js';
import { registerWorkspaceCatalogHttp } from './workspace-catalog-http.js';
import { registerWorkspaceLayoutsHttp } from './workspace-layout-http.js';
import { registerWorkspaceSessionHttp } from './workspace-http.js';
import { registerWorkspaceFilesHttp } from './workspace-file-http.js';
import { registerWorkspacePathHistoryHttp } from './workspace-path-history-http.js';
import { WorkspaceStorage } from './workspace-storage.js';

export { backup, migrations } from './workspace-storage.js';

export const activate: PluginModuleApi['activate'] = (context) => {
	const { database, http, log, state, ws } = context.app;
	context.use(
		{
			connections: ['@nexus-terminal/connections', 'connections'],
			credentials: ['@nexus-terminal/credentials', 'credentials'],
			ssh: ['@nexus-terminal/ssh', 'ssh'],
			tools: ['@nexus-terminal/remote-tools', 'remoteTools'],
		},
		(scope) => {
			const { connections, credentials, ssh, tools } = scope.plugin;
			const service = new WorkspaceService(database, connections, credentials, ssh, scope.signal, log, tools);
			scope.onDispose(() => service.dispose());
			registerWorkspaceAppearanceHttp(http, new WorkspaceBackgroundStorage(database), log, scope);
			registerWorkspaceCatalogHttp(http, new WorkspaceCatalogStorage(database), log, scope);
			registerWorkspaceLayoutsHttp(http, new WorkspaceLayoutStorage(database), log, scope);
			registerWorkspaceSessionHttp(http, service, log, scope);
			registerWorkspaceFilesHttp(http, service, log, scope);
			registerWorkspacePathHistoryHttp(http, new WorkspaceStorage(database), log, scope);

			const sessions = state.register({
				name: WorkspaceSessionsTopic,
				schema: SessionListResponseSchema,
				initial: { items: service.list() },
				lifetime: scope,
			});
			scope.onDispose(
				service.subscribe(() => {
					if (!scope.signal.aborted) sessions.publish({ items: service.list() });
				}),
			);

			ws.register({
				path: '/terminal',
				lifetime: scope,
				maxPayload: 65536,

				async handler(socket, { query }) {
					const id = query.get('sessionId');
					try {
						if (!id) return socket.close(1008);
						await service.attach(id, socket);
					} catch {
						socket.close(1008);
					}
				},
			});
			ws.register({
				path: '/status',
				lifetime: scope,
				maxPayload: 1024,

				handler(socket, { query }) {
					const id = query.get('sessionId');
					try {
						if (!id) return socket.close(1008);
						service.attachStatus(id, socket);
					} catch {
						socket.close(1008);
					}
				},
			});
			ws.register({
				path: '/transfers',
				lifetime: scope,
				maxPayload: 1024,

				handler(socket) {
					const send = (event: unknown) => {
						if (socket.readyState !== 1) return;
						if (socket.bufferedAmount > 256 * 1024) socket.close(1013);
						else socket.send(JSON.stringify(event));
					};

					const unsubscribe = service.transfers.subscribe(send);
					socket.once('close', unsubscribe);
					send({ type: 'snapshot', tasks: service.transfers.list() });
				},
			});
			context.self.readiness.set({ state: 'ready' });
		},
	);
};
