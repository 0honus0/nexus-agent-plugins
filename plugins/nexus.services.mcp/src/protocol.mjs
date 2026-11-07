import { Client, StreamableHTTPClientTransport, isInputRequiredResult } from '@modelcontextprotocol/client';
import { ServiceFailure, encoded, objectJson, text, collectFailures } from '../../../lib/services/failure.mjs';

const REQUEST_TIMER_MAX_MS = 2 ** 31 - 1;

export const MCP_SYNTHETIC_URL = 'https://nexus-managed.invalid/mcp';

function catalog(client, tools, resources, prompts) {
	if (
		new Set(tools.map((item) => item.name)).size !== tools.length ||
		new Set(resources.map((item) => item.uri)).size !== resources.length ||
		new Set(prompts.map((item) => item.name)).size !== prompts.length
	) {
		throw new Error('MCP_CATALOG_INVALID');
	}
	const value = {
		serverName: text(client.getServerVersion()?.name ?? ''),
		serverVersion: text(client.getServerVersion()?.version ?? ''),
		protocolVersion: text(client.getNegotiatedProtocolVersion() ?? ''),
		tools: tools.map((item) => ({
			name: text(item.name),
			description: text(item.description?.trim() ? item.description : item.name),
			inputSchemaJson: encoded(item.inputSchema),
		})),
		resources: resources.map((item) => ({ uri: text(item.uri), name: text(item.name) })),
		prompts: prompts.map((item) => ({
			name: text(item.name),
			description: text(item.description?.trim() ? item.description : item.name),
		})),
	};
	encoded(value);
	return value;
}

/** Only SDK protocol state survives detach. Each invocation rebinds transport I/O while the Host owns the Run connection. */
export class McpProtocolSession {
	constructor(facts) {
		this.protocolVersion = facts.protocolVersion;
		this.client = new Client(
			{ name: facts.client.name, version: facts.client.version },
			{
				enforceStrictCapabilities: true,
				supportedProtocolVersions: [facts.protocolVersion],
				listMaxPages: Number.MAX_SAFE_INTEGER,
				versionNegotiation: {
					mode: { pin: facts.protocolVersion },
					probe: { maxRetries: 0 },
				},
				inputRequired: { autoFulfill: false, maxRounds: 0 },
			},
		);
		this.sessionId = undefined;
		this.discovery = undefined;
		this.transport = null;
		this.busy = false;
	}

	async attach(fetch, signal) {
		if (this.busy || this.transport !== null) {
			throw new Error('MCP_SESSION_BUSY');
		}
		this.busy = true;
		const transport = new StreamableHTTPClientTransport(new URL(MCP_SYNTHETIC_URL), {
			// Era probes also need the Host signal: SDK negotiation does not forward
			// connect's signal to its transport fetch.
			fetch: (url, init) =>
				fetch(url, {
					...init,
					signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
				}),

			requestInit: { redirect: 'error', headers: { accept: 'application/json, text/event-stream' } },
			sessionId: this.sessionId,
			protocolVersion: this.sessionId === undefined ? undefined : this.protocolVersion,
			onInsufficientScope: 'throw',
			maxStepUpRetries: 0,
			reconnectionOptions: {
				maxRetries: 0,
				initialReconnectionDelay: 1000,
				maxReconnectionDelay: 1000,
				reconnectionDelayGrowFactor: 1,
			},
		});
		this.transport = transport;
		try {
			await this.client.connect(transport, {
				signal,
				// The Host signal owns the tool deadline; do not add a shorter handshake policy.
				timeout: REQUEST_TIMER_MAX_MS,
				prior: this.discovery === undefined ? undefined : { kind: 'modern', discover: this.discovery },
			});
			if (this.client.getNegotiatedProtocolVersion() !== this.protocolVersion) {
				throw new Error('MCP_VERSION_MISMATCH');
			}
			this.sessionId = transport.sessionId;
			this.discovery = this.client.getDiscoverResult();
			signal.throwIfAborted();
		} catch (cause) {
			const cleanup = await Promise.allSettled([this.detach()]);
			collectFailures(cleanup, cause, 'MCP negotiation and detach failed');
			throw cause;
		}
	}

	async discover(signal, refresh) {
		const capabilities = this.client.getServerCapabilities();
		const options = { signal, timeout: REQUEST_TIMER_MAX_MS, cacheMode: refresh ? 'refresh' : 'use' };
		const [tools, resources, prompts] = await Promise.all([
			capabilities?.tools ? this.client.listTools(undefined, options) : { tools: [] },
			capabilities?.resources ? this.client.listResources(undefined, options) : { resources: [] },
			capabilities?.prompts ? this.client.listPrompts(undefined, options) : { prompts: [] },
		]);
		return catalog(this.client, tools.tools, resources.resources, prompts.prompts);
	}

	async invoke(input, signal) {
		const args = objectJson(input.argumentsJson);
		const resume =
			input.resume === null
				? {}
				: {
						requestState: input.resume.requestState ?? undefined,
						inputResponses: objectJson(input.resume.inputResponsesJson),
					};
		const options = { signal, timeout: REQUEST_TIMER_MAX_MS, allowInputRequired: true };
		let result;
		if (input.kind === 'tool') {
			result = await this.client.callTool({ name: input.name, arguments: args, ...resume }, options);
		} else if (input.kind === 'resource') {
			result = await this.client.readResource({ uri: input.name, ...resume }, options);
		} else if (input.kind === 'prompt') {
			const strings = {};
			for (const [key, value] of Object.entries(args)) {
				if (typeof value !== 'string') {
					throw new ServiceFailure('invalid_input');
				}
				strings[key] = value;
			}
			result = await this.client.getPrompt({ name: input.name, arguments: strings, ...resume }, options);
		} else {
			throw new ServiceFailure('invalid_input');
		}
		if (isInputRequiredResult(result)) {
			return {
				kind: 'input_required',
				requestState: result.requestState ?? null,
				inputRequestsJson: encoded(result.inputRequests),
			};
		}
		return { kind: 'complete', resultJson: encoded(result) };
	}

	async detach() {
		const active = this.transport;
		if (active === null) {
			this.busy = false;
			return;
		}
		this.sessionId = active.sessionId;
		try {
			// Client.close() resets negotiated state; transport.close() preserves resumable protocol state.
			await active.close();
		} finally {
			this.transport = null;
			this.busy = false;
		}
	}

	async dispose() {
		const detached = await Promise.allSettled([this.detach()]);
		const results = await Promise.allSettled([Promise.resolve().then(() => this.client.close())]);
		this.sessionId = undefined;
		this.discovery = undefined;
		collectFailures([...detached, ...results], null, 'MCP protocol dispose failed');
	}

	async terminate() {
		if (this.transport !== null) {
			await this.transport.terminateSession();
		}
	}
}
