import { subscribeAgentPageStream } from '@/platform/client';
import { readAgentMemoryInvalidation } from '@nexus-terminal/shared/agent/memory/events';
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue';
import {
	listConversationMemories,
	reviewConversationMemory,
	verifyConversationMemory,
} from '@/features/agent/api/conversation-memory-api';
import type { ConversationMemory } from '@/features/agent/model/conversation-memory-types';
import { useAgentManagementOperation } from '@/features/agent/composables/use-agent-management-operation';

export function useConversationMemory(appId: string, threadId: string, active: () => boolean, proposed: () => void) {
	const items = ref<ConversationMemory[]>([]);
	const hasMore = ref(false);
	const needsRead = ref(false);
	const writeBlocked = ref(false);
	const loaded = ref(false);
	let knownIds = new Set<string>();
	let subscription: { close(): void } | null = null;
	let reading = false;
	let dirty = false;
	let mounted = false;
	let activated = true;
	let sessionRevoked = false;
	let writing = false;
	let pendingReview: ConversationMemory | null = null;
	const operation = useAgentManagementOperation(
		(reason) => {
			if (reason === 'session') sessionRevoked = true;
			if (reason === 'session' || reason === 'disposed') pendingReview = null;
			if (writing) {
				writeBlocked.value = true;
				needsRead.value = true;
			}
			stop();
			items.value = [];
			hasMore.value = false;
			loaded.value = false;
			knownIds.clear();
		},
		active,
		{ retainOnView: true },
	);

	function stop(): void {
		subscription?.close();
		subscription = null;
	}

	function canRead(): boolean {
		return (
			mounted &&
			activated &&
			!sessionRevoked &&
			active() &&
			!document.hidden &&
			!needsRead.value &&
			!writeBlocked.value
		);
	}

	function subscribe(): void {
		if (subscription || !canRead()) return;
		subscription = subscribeAgentPageStream({
			source: () => ({
				kind: 'memory',
				threadId,
			}),

			apply(value) {
				readAgentMemoryInvalidation(value);
				dirty = true;
				if (!reading && !writing && canRead()) void load(false);
				return true;
			},

			rejected() {
				stop();
				needsRead.value = true;
			},
		});
	}

	async function load(explicit: boolean): Promise<void> {
		if (
			!mounted ||
			!activated ||
			sessionRevoked ||
			!active() ||
			document.hidden ||
			(!explicit && (needsRead.value || writeBlocked.value))
		)
			return;
		if (reading) {
			dirty = true;
			return;
		}
		reading = true;
		dirty = false;
		await operation.execute(
			async (signal) => {
				if (explicit && pendingReview) await verifyConversationMemory(pendingReview, signal);
				return listConversationMemories(appId, threadId, signal);
			},
			(page) => {
				const added = page.items.some((item) => !knownIds.has(item.id));
				items.value = page.items;
				hasMore.value = page.hasMore;
				knownIds = new Set(page.items.map((item) => item.id));
				needsRead.value = false;
				loaded.value = true;
				if (explicit) {
					writeBlocked.value = false;
					pendingReview = null;
				}
				if (added) proposed();
			},
			{
				write: false,
				background: !explicit,

				onFailure: () => {
					needsRead.value = true;
				},
			},
		);
		reading = false;
		subscribe();
		if (dirty && canRead()) void load(false);
	}

	async function review(item: ConversationMemory, decision: 'publish' | 'reject'): Promise<void> {
		if (
			writeBlocked.value ||
			needsRead.value ||
			operation.busy.value ||
			operation.refreshRequired.value ||
			!items.value.includes(item)
		)
			return;
		const original: ConversationMemory = {
			id: item.id,
			appId: item.appId,
			content: item.content,
			version: item.version,
			expiresAt: item.expiresAt,
		};
		stop();
		writing = true;
		pendingReview = original;
		await operation.execute(
			(signal) => reviewConversationMemory(original, decision, signal),
			() => {
				items.value = items.value.filter((entry) => entry.id !== original.id);
				pendingReview = null;
			},
			{
				write: true,

				onFailure: () => {
					writeBlocked.value = true;
					needsRead.value = true;
				},
			},
		);
		writing = false;
		if (!writeBlocked.value) await load(false);
	}

	function resume(): void {
		stop();
		if (!canRead()) return;
		subscribe();
		if (!loaded.value || dirty) void load(false);
	}

	watch(active, resume, { flush: 'post' });
	onMounted(() => {
		mounted = true;
		document.addEventListener('visibilitychange', resume);
		resume();
	});
	onActivated(async () => {
		activated = true;
		await nextTick();
		resume();
	});
	onDeactivated(() => {
		activated = false;
		stop();
	});
	onBeforeUnmount(() => {
		mounted = false;
		stop();
		document.removeEventListener('visibilitychange', resume);
	});
	return { items, hasMore, needsRead, writeBlocked, operation, load, review };
}
