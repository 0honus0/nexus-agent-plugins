import { toChatSdkFailure } from '@/platform/sdk-failure';
import type { AgentPluginFrontendInput } from '@nexus-terminal/shared/agent/plugins/frontend-events';
import { readAgentWorkspaceRequest } from '@nexus-terminal/shared/agent/scope/workspace-http-codec';
import { readAgentPluginUiInput } from '@nexus-terminal/shared/agent/plugins/ui-http-codec';
import { AgentManagementFailure } from '@/features/agent/model/management-failure';
import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';

export { rejectAgentManagementResponse, agentManagementErrorStatus } from '@/features/agent/api/management-errors';

export interface ManagementRequest<T> {
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	expectedStatus?: 200 | 201;
	path: string;
	apiBase?: '/api/v1/agent' | '/api/v1/apps' | '/__next/api/v1/agent';
	headers?: () => Readonly<Record<string, string>>;
	maxRequestBytes: number;
	maxResponseBytes: number;
	input?: () => unknown;
	decode(value: unknown): T;
	signal?: AbortSignal;
}

/** Convert the existing feature API intentions to named SDK calls; no HTTP route crosses the port. */
export async function requestAgentManagement<T>(input: ManagementRequest<T>): Promise<T> {
	const platform = useAgentChatUiPlatform();
	if (input.signal?.aborted || platform.closed.value) throw new AgentManagementFailure('cancelled', 'not_dispatched');
	const environment = platform.environment.value;
	const url = new URL(input.path, 'https://ui.invalid');
	const parts = url.pathname.split('/').filter(Boolean);
	if (parts[0] === 'apps') {
		if (parts[1] !== environment.appId) throw new AgentManagementFailure('forbidden', 'not_dispatched');
		parts.splice(0, 2);
	}
	const body = input.input?.();
	let request: AgentPluginFrontendInput;
	let wrapWorkspace = false;
	if (parts.join('/') === 'workspace' && input.method === 'POST') {
		const value = readAgentWorkspaceRequest(body);
		if (value.appVersion !== environment.appVersion)
			throw new AgentManagementFailure('version_conflict', 'not_dispatched');
		request = value.request;
		wrapWorkspace = true;
	} else {
		const route = parts.join('/');
		let command: unknown;
		if (/^runs\/[^/]+\/usage$/u.test(route) && input.method === 'GET')
			command = { method: 'agent.runs.usage', params: { runId: parts[1] } };
		else if (/^threads\/[^/]+\/tools$/u.test(route) && input.method === 'GET')
			command = {
				method: 'agent.tools.list',
				params: {
					threadId: parts[1],
					before: url.searchParams.get('before'),
					limit: Number(url.searchParams.get('limit')),
				},
			};
		else if (/^runs\/[^/]+\/tools\/[^/]+$/u.test(route) && input.method === 'GET')
			command = { method: 'agent.tools.details', params: { runId: parts[1], toolId: parts[3] } };
		else if (route === 'memories' && input.method === 'GET') {
			const threadId = url.searchParams.get('threadId');
			command = {
				method: 'agent.memories.list',
				params: {
					status: url.searchParams.get('status'),
					limit: Number(url.searchParams.get('limit')),
					offset: Number(url.searchParams.get('offset')),
					...(threadId === null ? {} : { threadId }),
				},
			};
		} else if (/^memories\/[^/]+$/u.test(route) && input.method === 'GET')
			command = { method: 'agent.memories.get', params: { memoryId: parts[1] } };
		else if (/^memories\/[^/]+\/review$/u.test(route) && input.method === 'POST')
			command = { method: 'agent.memories.review', params: { memoryId: parts[1], input: body } };
		else if (route === 'artifacts' && input.method === 'GET')
			command = {
				method: 'agent.artifacts.list',
				params: {
					retained: url.searchParams.has('retained') ? url.searchParams.get('retained') === 'true' : null,
					kind: url.searchParams.get('kind'),
					q: url.searchParams.get('q') ?? '',
					offset: Number(url.searchParams.get('offset')),
					limit: Number(url.searchParams.get('limit')),
				},
			};
		else if (route === 'artifacts' && input.method === 'POST')
			command = { method: 'agent.artifacts.begin', params: body };
		else if (/^artifacts\/[^/]+$/u.test(route) && input.method === 'GET')
			command = { method: 'agent.artifacts.get', params: { artifactId: parts[1] } };
		else if (/^artifacts\/[^/]+$/u.test(route) && input.method === 'DELETE')
			command = { method: 'agent.artifacts.delete', params: { artifactId: parts[1], input: body } };
		else if (/^artifacts\/[^/]+\/retain$/u.test(route) && input.method === 'PATCH')
			command = { method: 'agent.artifacts.retain', params: { artifactId: parts[1], input: body } };
		else if (/^artifacts\/[^/]+\/attachments$/u.test(route) && input.method === 'POST') {
			const { readAgentArtifactAttach } = await import('@nexus-terminal/shared/agent/artifacts/http-codec');
			const value = readAgentArtifactAttach(body);
			if (value.targetAppId !== environment.appId)
				throw new AgentManagementFailure('forbidden', 'not_dispatched');
			command = {
				method: 'agent.artifacts.attach',
				params: {
					artifactId: parts[1],
					expectedVersion: value.expectedVersion,
					threadId: value.threadId,
					runId: value.runId,
				},
			};
		} else throw new AgentManagementFailure('capability_undeclared', 'not_dispatched');
		request = readAgentPluginUiInput(command);
	}
	try {
		const result = await platform.sdk.request(request, input.signal);
		if (input.signal?.aborted || platform.closed.value) throw new AgentManagementFailure('cancelled', 'unknown');
		if (wrapWorkspace)
			return input.decode({ appId: environment.appId, appVersion: environment.appVersion, result });
		return input.decode(result.value);
	} catch (cause) {
		throw toChatSdkFailure(cause);
	}
}
