import { mutateBatch, inspectPaths, inspectContainers, deliverFiles } from './batches.mjs';
import { projectGuidance } from './project-guidance.mjs';
import { shellOutput, hostDiagnostics } from './output.mjs';
import { readFiles } from './remote-files.mjs';
import { inspectProject } from './project-inspect.mjs';
import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

export async function executeRemote(name, input, call, signal) {
	if (name === 'file_read' || name === 'file_list') {
		return readFiles(name, input, call, signal);
	}
	if (name === 'remote_project_inspect') {
		return inspectProject(input, call, signal);
	}
	if (input.kind === 'write' || input.kind === 'move' || input.kind === 'delete' || input.kind === 'docker_control') {
		return mutateBatch(input, call, signal);
	}
	if (input.kind === 'inspect') {
		return inspectPaths(input, call, signal);
	}
	if (input.kind === 'docker_inspect') {
		return inspectContainers(input, call, signal);
	}
	if (input.kind === 'deliver') {
		return deliverFiles(input, call, signal);
	}
	if (input.kind === 'project') {
		return projectGuidance(input, call, signal);
	}
	if (input.kind === 'connections') {
		const value = await call({ operation: 'targets.list' });
		return {
			connections: value.connections.map((item) => ({
				id: item.id,
				name: item.name,
				host: item.host,
				port: item.port,
				username: item.username,
			})),
		};
	}
	if (input.kind === 'host_diagnostics') {
		return hostDiagnostics(await call({ operation: 'diagnostics.host' }));
	}
	if (input.kind === 'diagnostics') {
		const value = await call({ operation: 'diagnostics.readTarget', connectionId: input.connectionId });
		return {
			generatedAt: value.generatedAt,
			cpuPercent: value.cpuPercent,
			memUsedBytes: value.memUsedBytes,
			memTotalBytes: value.memTotalBytes,
			diskUsedBytes: value.diskUsedBytes,
			diskTotalBytes: value.diskTotalBytes,
			loadAverage: value.loadAverage.map((n) => n),
		};
	}
	if (input.kind === 'shell') {
		const value = await call({
			operation: 'shell.execute',
			connectionId: input.connectionId,
			commands: input.commands,
			onError: input.onError,
			cwd: input.cwd,
			mode: input.mode,
			yieldSeconds: input.yieldSeconds,
		});
		if (
			input.mode === 'foreground' &&
			value.result !== undefined &&
			value.result !== null &&
			value.result.status !== 'not_started'
		) {
			return {
				jobId: value.jobId,
				outputRead: { connectionId: input.connectionId, action: 'output', jobIds: [value.jobId], offset: 0 },
				status: value.result.status,
				commands: value.result.commands.map((item) =>
					item.status === 'not_started'
						? { index: item.index, status: item.status }
						: {
								index: item.index,
								status: item.status,
								exitCode: item.exitCode,
								signal: item.signal,
								stdout: item.stdout,
								stderr: item.stderr,
								truncated: item.truncated,
							},
				),
			};
		}
		return shellOutput(value);
	}
	if (input.kind === 'job') {
		const value = await call({
			operation: 'shell.jobs',
			connectionId: input.connectionId,
			action: input.action,
			jobIds: input.jobIds,
			waitMode: input.waitMode,
			waitSeconds: input.waitSeconds,
			offset: input.offset,
		});
		return shellOutput(value);
	}
	if (input.kind === 'patch') {
		const value = await call({
			operation: 'remote.patch',
			connectionId: input.connectionId,
			path: input.path,
			expectedSha256: input.expectedSha256,
			edits: input.edits.map((item) => ({ oldText: item.oldText, newText: item.newText })),
		});
		return { path: value.path, status: value.status, bytes: value.bytes, sha256: value.sha256 };
	}
	if (input.kind === 'search') {
		const value = await call({
			operation: 'remote.search',
			connectionId: input.connectionId,
			path: input.path,
			queries: input.queries.map((q) => q),
			maxResults: input.maxResults,
		});
		return {
			matches: value.matches.map((match) => ({
				queryIndex: match.queryIndex,
				path: match.path,
				line: match.line,
				column: match.column,
				text: match.text,
			})),
			truncated: value.truncated,
		};
	}
	throw new AgentFailure('invalid_input');
}
