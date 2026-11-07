import { agentRecord, agentText, InvalidAgentPayload, readAgentId } from '@nexus-terminal/shared/agent/http-codec';
import { AGENT_REASONING_EFFORTS, type AgentReasoningEffort } from '@nexus-terminal/shared/agent/providers/values';
import { AGENT_APPROVAL_MODES, type AgentApprovalMode } from '@nexus-terminal/shared/agent/runs/values';
import { AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES } from '@nexus-terminal/shared/agent/plugins/values';
import type { AgentPluginUiCheckpoint } from '@nexus-terminal/shared/agent/plugins/ui-events';

export interface ChatCheckpoint {
	text: string;
	modelKey: string;
	reasoningEffort: AgentReasoningEffort | '';
	approvalMode: AgentApprovalMode;
	threadId: string | null;
}

function text(value: unknown): string {
	return value === '' ? '' : agentText(value, AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES);
}

/** Checkpoints are plugin-owned presentation data, never authority for an operation. */
export function readChatCheckpoint(input: AgentPluginUiCheckpoint | null): ChatCheckpoint | null {
	if (input === null || input.version !== 1) return null;
	try {
		const r = agentRecord(
			JSON.parse(input.valueJson),
			['text', 'modelKey', 'reasoningEffort', 'approvalMode', 'threadId'],
			AGENT_PLUGIN_MAX_FRONTEND_MESSAGE_BYTES,
		);
		const approvalMode = AGENT_APPROVAL_MODES.find((value) => value === r.approvalMode);
		const reasoningEffort =
			r.reasoningEffort === '' ? '' : AGENT_REASONING_EFFORTS.find((value) => value === r.reasoningEffort);
		if (approvalMode === undefined || reasoningEffort === undefined) throw new InvalidAgentPayload();
		return {
			text: text(r.text),
			modelKey: text(r.modelKey),
			reasoningEffort,
			approvalMode,
			threadId: r.threadId === null ? null : readAgentId(r.threadId),
		};
	} catch {
		return null;
	}
}

export function createChatCheckpoint(value: ChatCheckpoint): AgentPluginUiCheckpoint {
	return { version: 1, valueJson: JSON.stringify(value) };
}
