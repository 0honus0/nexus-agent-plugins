import { shallowRef, type ShallowRef } from 'vue';
import type { AgentPluginFrontendSdk } from '@nexus-terminal/shared/agent/plugins/frontend-sdk';
import type {
	AgentPluginUiEnvironment,
	AgentPluginUiHostInput,
	AgentPluginUiHostResult,
} from '@nexus-terminal/shared/agent/plugins/ui-events';
import type { AgentTaskActivity, AgentTaskActivityRegistration } from '@/features/agent/model/task-activity-types';

export interface AgentChatUiPlatform {
	sdk: AgentPluginFrontendSdk;
	environment: ShallowRef<AgentPluginUiEnvironment>;
	closed: ShallowRef<boolean>;
	request(input: AgentPluginUiHostInput, signal?: AbortSignal, file?: File): Promise<AgentPluginUiHostResult>;
	onTaskOpen(listener: (runId: string) => void): () => void;
	dispose(): void;
}

let platform: AgentChatUiPlatform | null = null;

export function installAgentChatUiPlatform(value: AgentChatUiPlatform): void {
	if (platform) throw new Error('Chat UI platform already installed');
	platform = value;
}

export function useAgentChatUiPlatform(): AgentChatUiPlatform {
	if (!platform) throw new Error('Chat UI requires an authenticated Host bridge');
	return platform;
}

/** The view holds presentation intentions; Host owns the actual window and task notices. */
export function useAgentChatHost() {
	const owner = useAgentChatUiPlatform();
	return {
		get minimized(): boolean {
			return owner.environment.value.minimized;
		},

		open(): void {
			void owner.request({ kind: 'window.open' }).catch(() => undefined);
		},

		registerTaskActivity(): AgentTaskActivityRegistration {
			const current = shallowRef<AgentTaskActivity | null>(null);
			let lastTaskKey = '';
			const stop = owner.onTaskOpen((runId) => {
				if (current.value?.runId === runId) current.value.open();
			});
			return {
				update(activity): void {
					current.value = activity;
					const key = JSON.stringify(
						activity === null
							? null
							: [
									activity.runId,
									activity.threadTitle,
									activity.locallyStarted,
									activity.status,
									activity.preview,
									activity.blocked,
									activity.failureKey,
									activity.failureMessage,
									activity.toolExecutions,
									activity.approvals.map((approval) => [
										approval.id,
										approval.version,
										approval.status,
									]),
								],
					);
					if (key === lastTaskKey) return;
					lastTaskKey = key;
					void owner
						.request({
							kind: 'task.update',
							task:
								activity === null
									? null
									: {
											runId: activity.runId,
											threadTitle: activity.threadTitle,
											locallyStarted: activity.locallyStarted,
											status: activity.status,
											preview: activity.preview,
											blocked: activity.blocked,
											failureMessage: activity.failureMessage,
											failureKey: activity.failureKey,
										},
						})
						.catch(() => undefined);
				},

				dispose(): void {
					current.value = null;
					stop();
					void owner.request({ kind: 'task.update', task: null }).catch(() => undefined);
				},
			};
		},
	};
}
