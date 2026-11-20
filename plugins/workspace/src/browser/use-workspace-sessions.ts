import { ref, shallowRef, computed, onScopeDispose, watch } from 'vue';
import { PluginHttpError, type PluginContextApi } from 'nexus-terminal/browser';
import type { PluginWindowApi } from 'nexus-terminal/browser';
import type { Connection, ConnectionsClientApi } from '@nexus-terminal/connections/connections-client-api';
import {
	SessionListResponseSchema,
	SessionCreateResultSchema,
	WorkspaceSessionsTopic,
	type SessionInfo,
} from '../shared/workspace-types';
import { createWorkspaceClient } from './workspace-client';
import type { WorkspaceSessionPresentation } from '../shared/workspace-layout-types';

/** View navigation never releases a session. Only close, suspend or view disposal changes ownership. */
export function useWorkspaceSessions(props: {
	ctx: PluginContextApi;
	view: PluginWindowApi;
	hasTransfers?: (id?: string) => boolean;
	prepareSuspend?: (id: string) => Promise<WorkspaceSessionPresentation | undefined>;
}) {
	const connections = shallowRef<ConnectionsClientApi>(),
		sessions = ref<SessionInfo[]>([]),
		tabs = ref<SessionInfo[]>([]),
		active = ref('home'),
		selected = ref(''),
		connecting = ref(false),
		suspending = ref(false),
		host = ref<{ fingerprint: string; previousFingerprint?: string }>();
	const controller = new AbortController(),
		signal = AbortSignal.any([controller.signal, props.view.signal, props.ctx.signal]);
	const { request, report } = createWorkspaceClient(props.ctx, signal);
	const ownerClient = createWorkspaceClient(props.ctx, props.ctx.signal);
	const busySessions = ref<Record<string, boolean>>({});
	const connectionsLoaded = computed(() => readConnectionsState(false, (client) => client.loaded.value));
	const connectionsReadFailed = ref(false);
	let readConnections: (() => Promise<void>) | undefined;
	const confirmOpen = ref(false);
	let resolveConfirmation: ((value: boolean) => void) | undefined;

	function readConnectionsState<Value>(fallback: Value, read: (client: ConnectionsClientApi) => Value): Value {
		const client = connections.value;
		if (!client) return fallback;
		try {
			return read(client);
		} catch (cause) {
			// Older hosts can invalidate the proxy before aborting the binding.
			if (cause instanceof Error && 'code' in cause && cause.code === 'PLUGIN_SERVICE_EXPIRED') return fallback;
			throw cause;
		}
	}

	const hasTransfers = (id?: string) =>
		props.hasTransfers?.(id) ||
		sessions.value.some((s) => (!id || s.id === id) && s.transfers > 0) ||
		Object.entries(busySessions.value).some(([key, busy]) => (!id || key === id) && busy);

	function confirmTransfers(id?: string) {
		if (!hasTransfers(id)) return Promise.resolve(true);
		if (resolveConfirmation) return Promise.resolve(false);
		confirmOpen.value = true;
		return new Promise<boolean>((resolve) => {
			resolveConfirmation = resolve;
		});
	}

	function answer(value: boolean) {
		confirmOpen.value = false;
		resolveConfirmation?.(value);
		resolveConfirmation = undefined;
	}

	const stopCloseCheck = props.view.onBeforeClose(async (event) => {
		if (!(await confirmTransfers())) event.preventDefault();
	});
	props.view.onDispose(() => {
		for (const tab of tabs.value)
			props.ctx.app.tasks.background('close-workspace-session', () =>
				ownerClient.request('sessions/' + tab.id, 'DELETE'),
			);
	});
	const stop = props.ctx.use({ connections: ['@nexus-terminal/connections', 'connections'] }, (scope) => {
		const readSignal = AbortSignal.any([signal, scope.signal]);
		if (readSignal.aborted) return;
		const client = scope.plugin.connections;

		function forgetConnection() {
			if (connections.value !== client) return;
			readConnections = undefined;
			connectionsReadFailed.value = false;
			connections.value = undefined;
		}

		// Service proxies already reject reads when aborted. Drop the reference before
		// Vue evaluates a watcher, without waiting for asynchronous scope disposal.
		readSignal.addEventListener('abort', forgetConnection, { once: true });
		scope.onDispose(() => {
			readSignal.removeEventListener('abort', forgetConnection);
			forgetConnection();
		});
		connections.value = client;
		readConnections = async () => {
			if (readSignal.aborted) return;
			connectionsReadFailed.value = false;
			try {
				await client.refresh(readSignal);
			} catch (cause) {
				if (readSignal.aborted) return;
				connectionsReadFailed.value = true;
				report(cause);
			}
		};
		if (!client.loaded.value) void readConnections();
	});

	function retryConnections(): void {
		void readConnections?.();
	}

	function reconcileSessions(items: SessionInfo[]) {
		sessions.value = items;
		tabs.value = tabs.value.flatMap((tab) => {
			const current = items.find((session) => session.id === tab.id && session.state !== 'suspended');
			return current ? [current] : [];
		});
		busySessions.value = Object.fromEntries(
			Object.entries(busySessions.value).filter(([id]) => tabs.value.some((session) => session.id === id)),
		);
		if (active.value !== 'home' && !tabs.value.some((tab) => tab.id === active.value))
			active.value = tabs.value[0]?.id ?? 'home';
	}

	const stopState = props.ctx.app.state.subscribe(
		WorkspaceSessionsTopic,
		SessionListResponseSchema,
		{
			updated: ({ items }) => reconcileSessions(items),

			unconfirmed(reason) {
				// The server retires all sessions when the topic is withdrawn.
				// Preserve the tabs through an ordinary transport reconnect.
				if (reason === 'unavailable') reconcileSessions([]);
			},
		},
		signal,
	);
	onScopeDispose(() => {
		stop();
		stopState();
		stopCloseCheck();
		answer(false);
		controller.abort();
	});
	const savedConnections = computed(() =>
		readConnectionsState<Connection[]>([], (client) =>
			client.catalog.value.connections.map((connection) => ({ ...connection, tags: [...connection.tags] })),
		),
	);
	const suspended = computed(() => sessions.value.filter((s) => s.state === 'suspended'));
	watch(savedConnections, (items) => {
		if (selected.value && !items.some((c) => c.id === selected.value)) {
			selected.value = '';
			host.value = undefined;
		}
	});

	async function manage() {
		try {
			await connections.value?.openManager();
		} catch (e) {
			report(e);
		}
	}

	function start(id: string) {
		if (connecting.value) return;
		const connection = savedConnections.value.find((c) => c.id === id);
		if (!connection || connection.type !== 'ssh') return;
		if (!connection.credentialId) {
			void editCredential(id);
			return;
		}
		selected.value = id;
		void connect();
	}

	async function editCredential(connectionId: string) {
		props.ctx.app.log.report({
			level: 'warn',
			code: 'WORKSPACE_CREDENTIAL_REQUIRED',
			params: { connectionId },
		});
		try {
			await connections.value?.openEditor({ connectionId, reason: 'credential-required' });
		} catch (cause) {
			report(cause);
		}
	}

	function add(session: SessionInfo) {
		if (!tabs.value.some((s) => s.id === session.id)) tabs.value.push(session);
		active.value = session.id;
	}

	async function connect(fingerprint?: string) {
		if (!selected.value || connecting.value) return;
		connecting.value = true;
		try {
			const { result: value } = await request(
				'sessions',
				'POST',
				{
					connectionId: selected.value,
					...(fingerprint ? { hostKeyFingerprint: fingerprint } : {}),
				},
				SessionCreateResultSchema,
			);
			signal.throwIfAborted();
			if (value.state === 'confirm-host') {
				host.value = { fingerprint: value.fingerprint, previousFingerprint: value.previousFingerprint };
				return;
			}
			host.value = undefined;
			add(value.session);
		} catch (cause) {
			if (cause instanceof PluginHttpError && cause.code === 'WORKSPACE_CREDENTIAL_REQUIRED')
				await editCredential(selected.value);
			else report(cause);
		} finally {
			connecting.value = false;
		}
	}

	async function close(id: string) {
		if (suspending.value || !(await confirmTransfers(id)) || signal.aborted) return;
		// Revoke the visible tab immediately. The plugin, not the closing component,
		// owns the DELETE; terminal WS close also revokes the backend session.
		tabs.value = tabs.value.filter((s) => s.id !== id);
		if (active.value === id) active.value = tabs.value[0]?.id ?? 'home';
		props.ctx.app.tasks.background('close-workspace-session', () =>
			ownerClient.request('sessions/' + id, 'DELETE'),
		);
	}

	async function suspend(id: string) {
		if (
			!tabs.value.some((tab) => tab.id === id) ||
			suspending.value ||
			!(await confirmTransfers(id)) ||
			signal.aborted
		)
			return;
		suspending.value = true;
		try {
			// Suspension changes ownership. Finish its acknowledgement and detach the
			// local tab before an ordinary window close can clean up remaining tabs.
			await props.ctx.app.tasks.run(
				async (lifetime) => {
					const presentation = await props.prepareSuspend?.(id);
					lifetime.throwIfAborted();
					await createWorkspaceClient(props.ctx, lifetime).request('sessions/' + id + '/suspend', 'POST', {
						presentation,
					});
					lifetime.throwIfAborted();
					tabs.value = tabs.value.filter((s) => s.id !== id);
					if (active.value === id) active.value = 'home';
				},
				{ view: props.view },
			);
		} catch (e) {
			report(e);
		} finally {
			suspending.value = false;
		}
	}

	return {
		connections,
		connectionsLoaded,
		connectionsReadFailed,
		retryConnections,
		savedConnections,
		suspended,
		tabs,
		active,
		selected,
		connecting,
		suspending,
		host,
		busySessions,
		confirmOpen,
		answer,
		manage,
		start,
		add,
		connect,
		close,
		suspend,
	};
}
