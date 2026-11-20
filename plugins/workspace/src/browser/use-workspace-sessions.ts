import { ref, shallowRef, computed, onScopeDispose, watch } from 'vue';
import { PluginHttpError, type PluginContextApi } from 'nexus-terminal/browser';
import type { PluginWindowApi } from 'nexus-terminal/browser';
import type { ConnectionsClientApi } from '@nexus-terminal/connections/connections-client-api';
import {
	SessionListResponseSchema,
	SessionCreateResultSchema,
	WorkspaceSessionsTopic,
	type SessionInfo,
} from '../shared/workspace-types';
import { createWorkspaceClient } from './workspace-client';

/** View navigation never releases a session. Only close, suspend or view disposal changes ownership. */
export function useWorkspaceSessions(props: {
	ctx: PluginContextApi;
	view: PluginWindowApi;
	hasTransfers?: (id?: string) => boolean;
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
	const connectionsLoaded = computed(() => connections.value?.loaded.value ?? false);
	const connectionsReadFailed = ref(false);
	let readConnections: (() => Promise<void>) | undefined;
	const confirmOpen = ref(false);
	let resolveConfirmation: ((value: boolean) => void) | undefined;

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
		const client = scope.plugin.connections;
		const readSignal = AbortSignal.any([signal, scope.signal]);
		connections.value = client;
		readConnections = async () => {
			connectionsReadFailed.value = false;
			try {
				await client.refresh(readSignal);
			} catch (cause) {
				if (readSignal.aborted) return;
				connectionsReadFailed.value = true;
				report(cause);
			}
		};
		void readConnections();
		scope.onDispose(() => {
			connections.value = undefined;
			connectionsReadFailed.value = false;
			readConnections = undefined;
		});
	});

	function retryConnections(): void {
		void readConnections?.();
	}

	const stopState = props.ctx.app.state.subscribe(
		WorkspaceSessionsTopic,
		SessionListResponseSchema,
		{
			updated({ items }) {
				sessions.value = items;
				tabs.value = tabs.value.flatMap((tab) => {
					const current = sessions.value.find((s) => s.id === tab.id && s.state !== 'suspended');
					return current ? [current] : [];
				});
				busySessions.value = Object.fromEntries(
					Object.entries(busySessions.value).filter(([id]) => tabs.value.some((s) => s.id === id)),
				);
				if (active.value !== 'home' && !tabs.value.some((tab) => tab.id === active.value))
					active.value = tabs.value[0]?.id ?? 'home';
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
	const savedConnections = computed(() => connections.value?.catalog.value.connections ?? []);
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
					await createWorkspaceClient(props.ctx, lifetime).request('sessions/' + id + '/suspend', 'POST');
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
