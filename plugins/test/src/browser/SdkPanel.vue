<script setup lang="ts">
	import {
		HttpProblemCodeSchema,
		HttpProblemSchema,
		LogLevelSchema,
		LogParamsSchema,
		PluginHttpError,
		PluginLogInputSchema,
		type PluginWindowProps,
		type WindowTab,
	} from 'nexus-terminal/browser';
	import { UiButton } from 'nexus-terminal/browser/ui';
	import { computed, ref, shallowRef } from 'vue';
	import { EmptySchema, ProviderOutputSchema, RevisionSchema } from '../sdk-fixture-types.js';

	const { context, view } = defineProps<PluginWindowProps>();
	const { http, log, state, tasks, ws } = context.app;
	const revision = ref<number>();
	const stateStatus = ref('');
	const providerStatus = ref('');
	const socketEvent = ref('');
	const tabs = ref<WindowTab[]>([
		{ id: 'one', label: 'SDK first tab' },
		{
			id: 'two',
			label: 'SDK second tab',
			closable: true,
			menu: [{ id: 'inspect', label: 'Inspect SDK tab' }],
		},
	]);
	const current = ref('one');
	const result = ref('');
	const taskEvents = ref<string[]>([]);
	const messages = ref<string[]>([]);
	const connection = shallowRef<ReturnType<typeof ws.connect>>();
	const oversizedFrame = new Uint8Array(1025).buffer;
	const socketData = computed(() =>
		connection.value?.data.value instanceof ArrayBuffer ? 'binary data' : connection.value?.data.value,
	);

	const unsubscribe = state.subscribe(
		'revision',
		RevisionSchema,
		{
			updated(snapshot) {
				revision.value = snapshot.revision;
				stateStatus.value = 'current';
			},

			unconfirmed(reason) {
				stateStatus.value = reason;
			},
		},
		view.signal,
	);
	const unsubscribeProvider = state.subscribe(
		'provider',
		ProviderOutputSchema,
		{
			updated({ value }) {
				providerStatus.value = value;
			},

			unconfirmed(reason) {
				providerStatus.value = reason;
			},
		},
		view.signal,
	);
	view.onDispose(unsubscribeProvider);
	view.onDispose(unsubscribe);
	view.onDispose(() => {
		document.documentElement.dataset.sdkView = 'disposed';
	});

	for (const kind of ['started', 'settled'] as const) {
		const off = tasks.on(kind, (event) => {
			if (event.name?.startsWith('sdk-'))
				taskEvents.value.push([kind, event.mode, event.outcome].filter(Boolean).join(':'));
		});
		view.onDispose(off);
	}

	const allowClose = view.onBeforeClose((event) => {
		event.signal.throwIfAborted();
		if (!event.defaultPrevented) event.preventDefault();
	});

	const removeTabs = view.registerTabs({
		items: tabs,
		activeId: current,
		addLabel: 'Add SDK tab',

		onSelect(id) {
			current.value = id;
		},

		onClose(id) {
			tabs.value = tabs.value.filter((item) => item.id !== id);
			current.value = 'one';
		},

		onAdd() {
			if (!tabs.value.some(({ id }) => id === 'added')) tabs.value.push({ id: 'added', label: 'SDK added tab' });
			current.value = 'added';
		},

		onMenuSelect(id, menuId) {
			result.value = id + ':' + menuId;
		},
	});
	const removeActions = view.registerActions({
		items: [{ id: 'action', label: 'SDK action' }],

		onSelect(id) {
			result.value = id;
		},
	});

	async function probeHttp(): Promise<void> {
		const requestURL = new URL(http.url('/dependency'));
		const data = await tasks.run((signal) => http.json('/dependency', ProviderOutputSchema, { signal }), {
			name: 'sdk-http',
			view,
		});
		const reply = await http.request('/conflict', { signal: view.signal });
		const problem = HttpProblemSchema.parse(await reply.json());
		HttpProblemCodeSchema.parse('HTTP_NOT_FOUND');
		const failure = await http
			.json('/conflict', EmptySchema, { signal: view.signal })
			.catch((cause: unknown) => cause);
		if (!(failure instanceof PluginHttpError) || failure.status !== 409 || failure.code !== problem.code)
			throw new Error('SDK_HTTP_ERROR_CONTRACT');
		tasks.background('sdk-background', (signal) => signal.throwIfAborted());
		const external = new AbortController();
		await tasks
			.run(() => external.abort(), { name: 'sdk-cancel', signal: external.signal, view })
			.catch((cause) => {
				if (!(cause instanceof DOMException) || cause.name !== 'AbortError') throw cause;
			});
		log.report(
			PluginLogInputSchema.parse({
				level: LogLevelSchema.parse('info'),
				code: 'SDK_BROWSER_PROBE',
				params: LogParamsSchema.parse({ status: problem.status }),
			}),
		);
		result.value = [data.value, problem.code, requestURL.pathname.endsWith('/dependency')].join(' ');
	}

	function openSocket(): void {
		connection.value?.close();
		messages.value = [];
		socketEvent.value = '';
		const path = '/echo?label=sdk-ready';
		if (new URL(ws.url(path)).searchParams.get('label') !== 'sdk-ready') throw new Error('SDK_WS_URL');
		const socket = ws.connect(path, {
			signal: view.signal,

			onConnected() {
				socket.send('sdk-text');
				socket.send(Uint8Array.of(0, 42, 255).buffer);
			},

			onDisconnected(_socket, event) {
				socketEvent.value = String(event.code);
			},

			onMessage(_socket, message) {
				messages.value.push(
					message.data instanceof ArrayBuffer
						? [...new Uint8Array(message.data)].join(',')
						: String(message.data),
				);
			},
		});
		connection.value = socket;
	}

	function probeSocketError(): void {
		connection.value?.close();
		socketEvent.value = '';
		connection.value = ws.connect('/missing', {
			signal: view.signal,

			onError() {
				socketEvent.value = 'error';
			},
		});
	}

	function clearWindowControls(): void {
		removeActions();
		removeTabs();
	}

	async function requestClose(): Promise<void> {
		if (!(await view.requestClose())) result.value = 'close prevented';
	}
</script>

<template>
	<div>
		<p>Plugin {{ context.self.id }} {{ context.self.backend?.runtime }} {{ context.self.readiness.value.state }}</p>
		<p>Revision {{ revision }} {{ stateStatus }}</p>
		<p>Provider state {{ providerStatus }}</p>
		<p>Window {{ view.state.value.mode }} {{ view.state.value.focused ? 'focused' : 'blurred' }}</p>
		<p>Current tab {{ current }}</p>
		<output data-testid="sdk-result">{{ result }}</output>
		<output data-testid="sdk-task-events">{{ taskEvents.join(' ') }}</output>
		<output data-testid="sdk-ws-events">{{ messages.join(' ') }}</output>
		<output data-testid="sdk-ws-status">{{ connection?.status.value }}</output>
		<output data-testid="sdk-ws-data">{{ socketData }}</output>
		<output data-testid="sdk-ws-disconnected">{{ socketEvent }}</output>
		<div>
			<UiButton @click="probeHttp">Probe HTTP and tasks</UiButton>
			<UiButton @click="openSocket">Open SDK socket</UiButton>
			<UiButton @click="connection?.send(oversizedFrame)">Send oversized frame</UiButton>
			<UiButton @click="connection?.close()">Close SDK socket</UiButton>
			<UiButton @click="probeSocketError">Probe socket error</UiButton>
			<UiButton @click="clearWindowControls">Clear SDK window controls</UiButton>
			<UiButton @click="view.focus()">Focus SDK window</UiButton>
			<UiButton @click="view.minimize()">Minimize SDK window</UiButton>
			<UiButton @click="view.maximize()">Maximize SDK window</UiButton>
			<UiButton @click="view.restore()">Restore SDK window</UiButton>
			<UiButton @click="requestClose">Request SDK close</UiButton>
			<UiButton @click="allowClose">Allow SDK close</UiButton>
		</div>
	</div>
</template>
