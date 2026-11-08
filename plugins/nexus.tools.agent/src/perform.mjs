import { readRecallConfiguration } from './configuration.mjs';
import { searchDefinitions } from './discovery.mjs';
import { searchSkills, recallMemories } from './retrieval.mjs';
import { imageModelPage, presentArtifacts, readToolResults } from './content.mjs';
import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

const collaborationOperations = {
	collaboration_delegate: 'collaboration.delegate',
	collaboration_list: 'collaboration.list',
	collaboration_output_read: 'collaboration.readOutput',
	collaboration_join: 'collaboration.join',
	collaboration_cancel: 'collaboration.cancel',
	collaboration_message_send: 'collaboration.sendMessage',
	collaboration_message_read: 'collaboration.readMessages',
	collaboration_message_consume: 'collaboration.consumeMessages',
	collaboration_fact_read: 'collaboration.readFact',
	collaboration_fact_write: 'collaboration.writeFact',
};

export async function perform(name, input, call, signal, _serviceCall, context) {
	signal.throwIfAborted();
	if (input.kind === 'plugin_instances') {
		return { instances: await context.configuration.list() };
	}
	if (input.kind === 'plugin_settings_read') {
		return context.configuration.read(input.instanceId);
	}
	if (input.kind === 'plugin_settings_write') {
		const result = await context.configuration.write(input.instanceId, {
			operationKey: 'configuration:write',
			expectedPackageRevision: input.expectedPackageRevision,
			expectedRevision: input.expectedRevision,
			schemaRevision: input.schemaRevision,
			documentJson: input.documentJson,
		});
		if (result.kind === 'interrupted') {
			throw new AgentFailure('operation_unknown');
		}
		if (result.kind === 'rejected') {
			return { failure: { code: result.code } };
		}
		return { configuration: JSON.parse(result.resultJson) };
	}

	if (input.kind === 'collaboration') {
		const operation = collaborationOperations[name];
		if (!operation) {
			throw new AgentFailure('invalid_input');
		}
		const { action, ...command } = input.input;
		if (action === 'delegate') {
			const info = await context.run.describe();
			return call({
				operation,
				profile: command.profile,
				objective: command.objective,
				inputJson: info.inputJson,
				targets: command.targets.map((id) => id),
				dependencies: command.dependencies.map((id) => id),
				dependencyMode: command.dependencyMode,
			});
		}
		return call({ operation, ...command });
	}
	if (input.kind === 'tool_search') {
		const entries = [];
		let cursor = null;
		do {
			const page = await context.directory.discover({ contract: null, apiVersion: null, kind: 'tool', cursor });
			entries.push(...page.entries);
			cursor = page.nextCursor;
		} while (cursor !== null);
		const definitions = entries.map((entry) => ({
			name: entry.key,
			semanticName: entry.key.split('.').at(-1),
			description: entry.summary,
			loader: entry.tags.includes('loader'),
			parameters: [],
			keywords: entry.tags,
		}));
		const matches = searchDefinitions(definitions, input.query);
		return {
			matches: matches.map((tool) => ({ key: tool.name, summary: tool.description })),
			loadKeys: matches.map((tool) => tool.name),
			availableNextTurn: true,
		};
	}
	if (input.kind === 'skill') {
		if (input.input.action === 'search') {
			return searchSkills(input.input, call, signal);
		}
		return call({
			operation: 'skills.read',
			name: input.input.name,
			version: input.input.version,
			sha256: input.input.sha256,
		});
	}
	if (input.kind === 'image_models') {
		const result = await call({ operation: 'images.list' });
		return imageModelPage(result.models, input.offset);
	}
	if (input.kind === 'image_generate') {
		const saved = await call({
			operation: 'images.generate',
			providerId: input.input.providerId,
			configurationVersion: input.input.configurationVersion,
			modelId: input.input.modelId,
			prompt: input.input.prompt,
		});
		return { id: saved.id, name: saved.name, sizeBytes: saved.sizeBytes };
	}
	if (input.kind === 'checkpoint') {
		return { appDirective: { kind: 'contextCheckpoint', summary: input.summary } };
	}
	if (input.kind === 'artifact') {
		if (input.action === 'create') {
			const base64 = Buffer.from(input.content, 'utf8').toString('base64');
			const saved = await call({
				operation: 'artifacts.create',
				name: input.name,
				mediaType: 'text/plain',
				base64,
			});
			return {
				id: saved.id,
				version: saved.version,
				status: saved.status,
				sizeBytes: saved.sizeBytes,
				sha256: saved.sha256,
			};
		}
		if (input.action === 'present') {
			return presentArtifacts(input.artifactIds, call, signal);
		}
		const page = await call({
			operation: 'artifacts.read',
			artifactId: input.artifactId,
			offset: input.offset,
			maxBytes: input.maxBytes,
			encoding: input.encoding,
		});
		return {
			id: page.id,
			sha256: page.sha256,
			sizeBytes: page.sizeBytes,
			offset: page.offset,
			nextOffset: page.nextOffset,
			encoding: input.encoding,
			base64: page.base64,
			text: page.text,
			untrusted: true,
		};
	}
	if (input.kind === 'memory') {
		if (input.action === 'propose') {
			const saved = await call({
				operation: 'memory.propose',
				content: input.content,
				confidence: 0.5,
				expiresAt: null,
			});
			return { id: saved.id, status: saved.status, version: saved.version };
		}
		const source = await context.configuration.read();
		signal.throwIfAborted();
		if (!source.settings) {
			throw new AgentFailure('invalid_input');
		}
		const configuration = readRecallConfiguration(
			source.configuration.revision === 0 ? source.settings.defaultsJson : source.configuration.documentJson,
		);
		return recallMemories(input, call, signal, configuration);
	}
	if (input.kind === 'result') {
		return readToolResults(input.items, call, signal);
	}
	throw new AgentFailure('invalid_input');
}
