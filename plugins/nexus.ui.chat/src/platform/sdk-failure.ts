import { PluginUiRequestFailure } from 'nexus:frontend-sdk';
import { readAgentErrorResponse } from '@nexus-terminal/shared/agent/http-codec';
import { AgentManagementFailure } from '@/features/agent/model/management-failure';
import { HttpRequestFailure } from '@/client/http/request-failure';

/** Preserve the SDK's named failure and dispatch outcome at the presentation boundary. */
export function toChatSdkFailure(cause: unknown): AgentManagementFailure {
	if (cause instanceof AgentManagementFailure) return cause;
	if (cause instanceof PluginUiRequestFailure)
		return new AgentManagementFailure(cause.code, cause.outcome, { cause });
	if (cause instanceof HttpRequestFailure) return new AgentManagementFailure(cause.code, cause.outcome, { cause });
	if (cause instanceof Error && 'code' in cause) {
		const unknown = 'outcomeUnknown' in cause && cause.outcomeUnknown === true;
		if (cause.code === 'cancelled')
			return new AgentManagementFailure('cancelled', unknown ? 'unknown' : 'not_dispatched', { cause });
		try {
			const { code } = readAgentErrorResponse({ code: cause.code });
			return new AgentManagementFailure(code, unknown ? 'unknown' : 'confirmed', { cause });
		} catch {
			return new AgentManagementFailure('protocol_failure', 'unknown', { cause });
		}
	}
	return new AgentManagementFailure('request_failed', 'unknown', { cause });
}
