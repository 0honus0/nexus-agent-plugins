import { hasToolIdentity, hasApprovalIdentity } from '@nexus-test/support/package-tool-catalog.mjs';
import { randomUUID } from 'node:crypto';
import {
	resolveNativeApproval,
	prepareNativeTask,
	openNativeTask,
	startNativeTask,
	finishNativeTask,
	cancelNativeTask,
	readNativeRun,
	waitNativeApproval,
} from '@nexus-test/e2e/support/agent-host/native-task';
import { installTestPlugin } from '@nexus-test/e2e/support/plugins';
import { requestAgentWorkspace } from '@nexus-test/e2e/support/agent';
import { expect, test } from '@nexus-test/e2e/support/fixtures';
import { loginAsInitialAdmin } from '@nexus-test/e2e/support/auth';
import { step } from '@nexus-test/e2e/support/steps';
import { ensureTestSshConnection } from '@nexus-test/e2e/support/ssh';
import { E2E_URLS } from '@nexus-test/support/protocols/test-environment';
import {
	enablePluginApp,
	cancelBrowserPhase,
	configureLifecycleBrowser,
	browserControl,
	releaseBrowserCreationBarrier,
	releaseBrowserModel,
} from '@nexus-test/e2e/support/agent-host/plugin-fixture';

test.use({ e2eServices: ['browser', 'plugins', 'provider', 'ssh'] });

test.use({ actionTimeout: 10_000 });

test('Nexus Agent Browser lifecycle cases reclaim contexts across cancellation and approval boundaries', async ({
	request,
	page,
}) => {
	await loginAsInitialAdmin(request);
	const connectionId = await ensureTestSshConnection(request);
	const installed = await installTestPlugin(request, 'nexus.agent');
	const app = await enablePluginApp(request, installed.appId);
	const task = await prepareNativeTask(
		request,
		page,
		['browser.read', 'browser.interact', 'shell.execute'],
		[connectionId],
		app,
	);
	const browser = await configureLifecycleBrowser(request, task.app.id);
	await openNativeTask(task);
	for (const phase of ['cancel-creating', 'complete', 'cancel-live', 'repeat', 'cancel-approval', 'approve']) {
		await step(`Root Browser cleanup: ${phase}`, async () => {
			// Exercise real chat submission once; subsequent resource-lifecycle
			// cases use the same App boundary without reconstructing its iframe.
			const creating = phase === 'cancel-creating';
			const approval = phase === 'cancel-approval' || phase === 'approve';
			const cancel = phase.startsWith('cancel-');
			const baseline = (await browserControl('/contexts')).browserContextIds;
			if (creating) {
				await browserControl('/creation-barrier', 'POST');
			}
			const prompt = `E2E_BROWSER_LIFECYCLE ${randomUUID()} version=${browser.version}${approval ? ' E2E_BROWSER_APPROVAL=' + connectionId : ''}`;
			const run = await (async () => {
				if (creating) return startNativeTask(task, prompt, [connectionId]);
				const started = await requestAgentWorkspace(request, app, {
					method: 'agent.runs.create',
					params: {
						threadId: task.thread.id,
						operationId: randomUUID(),
						input: { ...task.input, prompt, connectionIds: [connectionId] },
					},
				});
				if (started.method !== 'agent.runs.create') throw new Error('Unexpected Run creation receipt');
				return started.value.run;
			})();
			try {
				try {
					const open = await waitNativeApproval(task, run.id, 'browser_open');
					await resolveNativeApproval(task, open, 'approved');
					if (creating) {
						await expect.poll(async () => (await browserControl('/creation-barrier')).held).toBe(true);
					} else if (approval) {
						await waitNativeApproval(task, run.id, 'shell_execute');
					} else {
						await expect
							.poll(
								async () =>
									(await (await fetch(E2E_URLS.openAiProviderOrigin + '/browser-lifecycle')).json())
										.held,
							)
							.toBe(true);
					}
					await expect
						.poll(async () => (await browserControl('/contexts')).browserContextIds)
						.toHaveLength(baseline.length + 1);
					expect((await readNativeRun(task, run.id)).status).toBe('running');
					if (cancel) {
						await cancelBrowserPhase(
							creating,
							() => cancelNativeTask(task, run.id),
							async () => (await readNativeRun(task, run.id)).status === 'cancelled',
						);
					} else if (approval) {
						await resolveNativeApproval(
							task,
							await waitNativeApproval(task, run.id, 'shell_execute'),
							'approved',
						);
						await expect
							.poll(
								async () =>
									(await (await fetch(E2E_URLS.openAiProviderOrigin + '/browser-lifecycle')).json())
										.held,
							)
							.toBe(true);
					}
				} finally {
					if (creating) {
						await releaseBrowserCreationBarrier();
					}
					await releaseBrowserModel();
				}
				const result = await finishNativeTask(task, run.id);
				expect(result.run.status).toBe(cancel ? 'cancelled' : 'completed');
				if (!cancel) {
					expect(result.text).toBe('Browser lifecycle fixture completed.');
				}
				await expect.poll(async () => (await browserControl('/contexts')).browserContextIds).toEqual(baseline);
				if (phase === 'cancel-approval') {
					const approvals = await requestAgentWorkspace(request, app, {
						method: 'agent.approvals.list',
						params: { runId: run.id, after: null },
					});
					if (approvals.method !== 'agent.approvals.list') {
						throw new Error('Unexpected approvals');
					}
					expect(approvals.value.hasMore).toBe(false);
					expect(
						approvals.value.items.filter((item) => hasApprovalIdentity(item, 'shell_execute')),
					).toHaveLength(1);
					expect(
						approvals.value.items.find((item) => hasApprovalIdentity(item, 'shell_execute'))!.consumedAt,
					).toBeNull();
				}
			} finally {
				await cancelNativeTask(task, run.id);
			}
		});
	}
});
