import type { Connection } from '../shared/connection-types';

export function connectionEndpoint(item: Pick<Connection, 'host' | 'port'>) {
	const host = item.host.includes(':') && !item.host.startsWith('[') ? `[${item.host}]` : item.host;
	return `${host}:${item.port}`;
}

export function connectionAddress(item: Pick<Connection, 'host' | 'port' | 'username'>) {
	return `${item.username ? item.username + '@' : ''}${connectionEndpoint(item)}`;
}
