import { agentInteger, agentRecord, InvalidAgentPayload, readAgentId } from '@nexus-terminal/shared/agent/http-codec';
import {
	readAgentPluginModelDescriptor,
	readAgentPluginModelMessages,
	readAgentPluginModelRequest,
} from '@nexus-terminal/shared/agent/plugins/app-runtime';

// Private state is loaded through immutable chunked content, not a finite HTTP
// control reply. Keep exact field decoding without applying the control budget
// to conversation history or saved tool arguments.
function stateRecord(input, keys) {
	return agentRecord(input, keys, Number.MAX_SAFE_INTEGER);
}

function text(value) {
	if (typeof value !== 'string') {
		throw new InvalidAgentPayload();
	}
	return value;
}

function phase(input) {
	if (input === null || typeof input !== 'object' || !('kind' in input)) {
		throw new InvalidAgentPayload();
	}
	switch (input.kind) {
		case 'prepare':
		case 'imageGenerate':
		case 'title':
			stateRecord(input, ['kind']);
			return { kind: input.kind };
		case 'exchange': {
			const row = stateRecord(input, [
				'kind',
				'purpose',
				'request',
				'cut',
				'checkpointBindings',
				'parallelBindings',
			]);
			if (row.purpose !== 'main' && row.purpose !== 'compact' && row.purpose !== 'title') {
				throw new InvalidAgentPayload();
			}
			const cut = row.cut === null ? null : agentInteger(row.cut, 1);
			if ((row.purpose === 'compact') !== (cut !== null)) {
				throw new InvalidAgentPayload();
			}
			if (!Array.isArray(row.checkpointBindings) || !Array.isArray(row.parallelBindings)) {
				throw new InvalidAgentPayload();
			}
			return {
				kind: 'exchange',
				purpose: row.purpose,
				checkpointBindings: row.checkpointBindings.map(readAgentId),
				parallelBindings: row.parallelBindings.map(readAgentId),
				request: readAgentPluginModelRequest(row.request),
				cut,
			};
		}
		case 'tools': {
			const row = stateRecord(input, ['kind', 'calls', 'index']);
			if (!Array.isArray(row.calls)) {
				throw new InvalidAgentPayload();
			}
			const calls = row.calls.map((value) => {
				const call = stateRecord(value, [
					'bindingId',
					'operationKey',
					'argumentsJson',
					'callId',
					'checkpoint',
					'parallel',
				]);
				if (typeof call.checkpoint !== 'boolean' || typeof call.parallel !== 'boolean') {
					throw new InvalidAgentPayload();
				}
				return {
					checkpoint: call.checkpoint,
					parallel: call.parallel,
					bindingId: readAgentId(call.bindingId),
					operationKey: text(call.operationKey),
					argumentsJson: text(call.argumentsJson),
					callId: text(call.callId),
				};
			});
			const index = agentInteger(row.index);
			if (index > calls.length || new Set(calls.map((call) => call.callId)).size !== calls.length) {
				throw new InvalidAgentPayload();
			}
			return { kind: 'tools', calls, index };
		}
		case 'imagePresent':
		case 'imageAppend': {
			const row = stateRecord(input, ['kind', 'artifact']);
			const artifact = stateRecord(row.artifact, ['id', 'name']);
			return { kind: row.kind, artifact: { id: readAgentId(artifact.id), name: text(artifact.name) } };
		}
		case 'titleWrite': {
			const row = stateRecord(input, ['kind', 'title', 'expectedThreadVersion']);
			return {
				kind: 'titleWrite',
				title: text(row.title),
				expectedThreadVersion: agentInteger(row.expectedThreadVersion, 1),
			};
		}
		case 'done':
			stateRecord(input, ['kind']);
			return { kind: 'done' };
		default:
			throw new InvalidAgentPayload();
	}
}

/** Private App state is versioned independently from Host tables and SDK envelopes. */
export function readRunState(input) {
	const row = stateRecord(input, [
		'schema',
		'options',
		'pendingSummary',
		'messages',
		'iteration',
		'loadedKeys',
		'descriptor',
		'phase',
		'resultText',
	]);
	if (row.schema !== 4 || !Array.isArray(row.loadedKeys)) {
		throw new InvalidAgentPayload();
	}
	const loadedKeys = row.loadedKeys.map(text);
	if (new Set(loadedKeys).size !== loadedKeys.length) {
		throw new InvalidAgentPayload();
	}
	const options = stateRecord(row.options, ['instructions', 'compactionMode']);
	if (!['aggressive', 'balanced', 'conservative'].includes(options.compactionMode)) {
		throw new InvalidAgentPayload();
	}
	return {
		schema: 4,
		options: { instructions: text(options.instructions), compactionMode: options.compactionMode },
		pendingSummary: row.pendingSummary === null ? null : text(row.pendingSummary),
		messages: readAgentPluginModelMessages(row.messages),
		iteration: agentInteger(row.iteration),
		loadedKeys,
		descriptor: readAgentPluginModelDescriptor(row.descriptor),
		phase: phase(row.phase),
		resultText: text(row.resultText),
	};
}
