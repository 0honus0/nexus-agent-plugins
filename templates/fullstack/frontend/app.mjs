import { connectNexusPlugin } from '/sdk/frontend-v4.mjs';

const frontendStatus = document.querySelector('[data-testid="fullstack-frontend-status"]');
const backendStatus = document.querySelector('[data-testid="fullstack-backend-status"]');
const writeButton = document.querySelector('[data-testid="fullstack-write-storage"]');
const storageResult = document.querySelector('[data-testid="fullstack-storage-result"]');
let blocked = false;
let subscription = null;

try {
	const nexus = await connectNexusPlugin();
	window.addEventListener(
		'pagehide',
		() => {
			nexus.close().catch(() => console.error('PLUGIN_VIEW_CLOSE_FAILED'));
		},
		{ once: true },
	);

	const request = async (input) => {
		const response = await nexus.request(input);
		if (response.method !== input.method) {
			throw new Error('PLUGIN_RESPONSE_MISMATCH');
		}
		return response.value;
	};

	const app = await request({ method: 'host.appInfo', params: {} });
	frontendStatus.textContent = `frontend:ready:${app.appId}@${app.version}`;
	backendStatus.textContent = 'backend:not-invoked';
	writeButton.addEventListener('click', async () => {
		if (blocked || writeButton.disabled) {
			return;
		}
		writeButton.disabled = true;
		try {
			if (subscription) {
				await nexus.agent.runs.unsubscribe(subscription.id);
			}
			const current = await request({ method: 'storage.get', params: { key: 'frontend.demo' } });
			const previous = current?.valueJson == null ? null : JSON.parse(current.valueJson);
			const counter = Number.isSafeInteger(previous?.counter) && previous.counter >= 0 ? previous.counter + 1 : 1;
			const next = await request({
				method: 'storage.put',
				params: {
					key: 'frontend.demo',
					expectedVersion: current?.version ?? 0,
					operationId: crypto.randomUUID(),
					valueJson: JSON.stringify({ source: 'frontend', counter }),
				},
			});
			storageResult.textContent = `storage:version:${next.version}:counter:${counter}`;
			const thread = await request({
				method: 'agent.threads.create',
				params: { operationId: crypto.randomUUID(), title: 'SDK example', autoTitle: false },
			});
			const created = await request({
				method: 'agent.runs.create',
				params: {
					threadId: thread.id,
					operationId: crypto.randomUUID(),
					input: { approvalMode: 'ask', prompt: 'Record backend status', connectionIds: [], inputJson: '{}' },
				},
			});

			const refresh = async () => {
				const run = await request({ method: 'agent.runs.get', params: { runId: created.run.id } });
				backendStatus.textContent =
					run?.status === 'completed' ? 'backend:active' : `backend:${run?.status ?? 'unavailable'}`;
				if (run && ['completed', 'failed', 'cancelled', 'unknown'].includes(run.status)) {
					writeButton.disabled = blocked;
				}
			};

			let refreshQueue = Promise.resolve();

			const enqueue = () => {
				refreshQueue = refreshQueue.catch(() => undefined).then(refresh);
				return refreshQueue;
			};

			subscription = nexus.agent.runs.subscribe(created.run.id, 0, enqueue, (error) => {
				backendStatus.textContent = `backend:error:${error.message}`;
			});
			await enqueue();
		} catch (error) {
			blocked = error?.outcomeUnknown === true;
			storageResult.textContent = `storage:error:${error instanceof Error ? error.message : String(error)}`;
			writeButton.disabled = blocked;
		}
	});
} catch (error) {
	frontendStatus.textContent = `frontend:error:${error instanceof Error ? error.message : String(error)}`;
}
