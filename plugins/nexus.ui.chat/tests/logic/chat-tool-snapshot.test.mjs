import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { createRenderer, nextTick, ref, shallowRef } from 'vue';
import { installAgentChatUiPlatform } from '../../src/features/agent/chat-ui/platform';
import { useNativeRuns } from '../../src/features/agent/composables/use-native-runs';
import * as api from '../../src/features/agent/api/native-run-api';
import { listNativeThreadTools } from '../../src/features/agent/api/native-tools-api';
import { subscribeNativeRun } from '../../src/features/agent/api/native-run-stream';

vi.mock('@/features/agent/api/native-run-api', () => ({
	listNativeModels: vi.fn(),
	listNativeRuns: vi.fn(),
	getNativeRun: vi.fn(),
	getNativeRunUsage: vi.fn(),
	listNativeEntries: vi.fn(),
	listNativeEntryHistory: vi.fn(),
	listNativeEvents: vi.fn(),
	listNativeChildren: vi.fn(),
	listNativeApprovals: vi.fn(),
	listNativeMessages: vi.fn(),
	mutateNativeRun: vi.fn(),
}));
vi.mock('@/features/agent/api/native-tools-api', () => ({ listNativeThreadTools: vi.fn() }));
vi.mock('@/features/agent/api/native-run-stream', () => ({ subscribeNativeRun: vi.fn() }));
vi.mock('@/platform/feedback', () => ({ useFeedbackMessage: vi.fn() }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key) => key, te: () => false }) }));
vi.mock('@/client/logging/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const platform = {
	environment: shallowRef({ appId: 'app', appVersion: 1, checkpoint: null, targets: [], resumeRevision: 0 }),
	closed: shallowRef(false),
	request: vi.fn(async () => ({ accepted: true })),
};
installAgentChatUiPlatform(platform);

const thread = { id: 'thread', appId: 'app', title: 'Thread', version: 1, createdAt: 1, updatedAt: 1 };
const running = {
	id: 'run',
	appId: 'app',
	threadId: thread.id,
	approvalMode: 'ask',
	status: 'running',
	failure: null,
	version: 1,
	createdAt: 1,
	updatedAt: 1,
};
const terminal = { ...running, status: 'unknown', version: 2, updatedAt: 2 };
const cursor = { runSequence: 0, messageOrdinal: 0, chunkIndex: 0, textOffset: 0 };
const body = { items: [], nextCursor: cursor };
const usage = { runId: running.id, runVersion: 2, toolExecutions: 1 };
const dispatched = { id: 'tool', runId: running.id, revision: 1, state: 'dispatched', createdAt: 1 };
const finished = { ...dispatched, revision: 2, state: 'unknown' };
const tools = (item) => ({ items: [item], nextCursor: null });
const renderer = createRenderer({
	createComment: () => ({}),
	insert() {},
	remove() {},
	parentNode: () => null,
	nextSibling: () => null,
});
let mounted;

function mountRuns() {
	const observe = ref(false);
	let runs;
	mounted = renderer.createApp({
		setup() {
			runs = useNativeRuns(
				'app',
				() => false,
				() => false,
				() => true,
				() => observe.value,
			);
			return () => null;
		},
	});
	mounted.mount({});
	runs.scope.value = { appId: 'app', appVersion: 1 };
	runs.thread.value = thread;
	runs.run.value = running;
	runs.operation.refreshRequired.value = false;
	return { runs, observe };
}

async function startStream(observe) {
	observe.value = true;
	await nextTick();
	assert.equal(subscribeNativeRun.mock.calls.length, 1);
	return subscribeNativeRun.mock.calls[0][3];
}

function update(run) {
	return {
		body,
		state: { thread, run, usage, events: { items: [], nextCursor: 0 }, approvals: [], children: [], resources: [] },
		more: false,
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetAllMocks();
	platform.closed.value = false;
	vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' }));
	vi.stubGlobal(
		'window',
		Object.assign(new EventTarget(), {
			setTimeout: (...args) => setTimeout(...args),
			clearTimeout: (...args) => clearTimeout(...args),
		}),
	);
	api.listNativeEvents.mockResolvedValue({ items: [], nextCursor: 0 });
	api.listNativeApprovals.mockResolvedValue([]);
	api.listNativeChildren.mockResolvedValue([]);
	api.listNativeEntries.mockResolvedValue(body);
	api.getNativeRun.mockResolvedValue(terminal);
	api.getNativeRunUsage.mockResolvedValue(usage);
	listNativeThreadTools.mockResolvedValue(tools(dispatched));
	subscribeNativeRun.mockReturnValue({ close: vi.fn(), resume: vi.fn() });
});

afterEach(() => {
	mounted?.unmount();
	mounted = undefined;
	assert.equal(vi.getTimerCount(), 0);
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test('terminal Run snapshots reread tools committed after the initial tool page', async () => {
	listNativeThreadTools.mockResolvedValueOnce(tools(dispatched)).mockResolvedValueOnce(tools(finished));
	const { runs, observe } = mountRuns();
	await runs.refreshRun();
	assert.equal(runs.run.value.status, 'unknown');
	assert.equal(runs.tools.value[0].state, 'unknown');
	assert.equal(listNativeThreadTools.mock.calls.length, 2);
	assert.equal(api.listNativeEntries.mock.calls.length, 2);
	const apply = await startStream(observe);
	apply(update(terminal));
	await vi.runAllTimersAsync();
	assert.equal(listNativeThreadTools.mock.calls.length, 2);
	assert.equal(runs.tools.value[0].state, 'unknown');
});

test('active Run snapshots keep one parallel tool read', async () => {
	api.getNativeRun.mockResolvedValue(running);
	const { runs } = mountRuns();
	await runs.refreshRun();
	assert.equal(runs.tools.value[0].state, 'dispatched');
	assert.equal(listNativeThreadTools.mock.calls.length, 1);
	assert.equal(api.listNativeEntries.mock.calls.length, 1);
});

test('stopping a terminal subscription accepts the same thread in-flight tool snapshot', async () => {
	const read = Promise.withResolvers();
	listNativeThreadTools.mockReturnValue(read.promise);
	const { runs, observe } = mountRuns();
	const apply = await startStream(observe);
	apply(update(running));
	await vi.advanceTimersByTimeAsync(250);
	assert.equal(listNativeThreadTools.mock.calls.length, 1);
	apply(update(terminal));
	read.resolve(tools(finished));
	await vi.advanceTimersByTimeAsync(0);
	assert.equal(runs.tools.value[0]?.state, 'unknown');
});

test('removing the selected thread prevents a late tool snapshot from reappearing', async () => {
	const read = Promise.withResolvers();
	listNativeThreadTools.mockReturnValue(read.promise);
	const { runs, observe } = mountRuns();
	const apply = await startStream(observe);
	apply(update(running));
	await vi.advanceTimersByTimeAsync(250);
	runs.forgetThread(thread.id);
	read.resolve(tools(finished));
	await vi.advanceTimersByTimeAsync(0);
	assert.deepEqual(runs.tools.value, []);
});
