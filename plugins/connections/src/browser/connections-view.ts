import { inject, type InjectionKey } from 'vue';
import type { ConnectionsClient } from './connections-client-api.js';

export const connectionsKey: InjectionKey<ConnectionsClient> = Symbol('connections');

export function useConnections(): ConnectionsClient {
	const client = inject(connectionsKey);
	if (!client) throw new Error('CONNECTIONS_CONTEXT_MISSING');
	return client;
}
