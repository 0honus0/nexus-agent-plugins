import { definitions } from './definitions.mjs';
import { createToolRuntime } from '../../../lib/model-tools/runtime.mjs';
import { decodeInput, toolArguments } from './input.mjs';
import { record, readInput, absolutePath } from './remote-files.mjs';
import { executeRemote } from './execute.mjs';
import { RemoteToolFailure } from './failure.mjs';

function decode(name, argumentsJson) {
	if (!['file_read', 'file_list', 'remote_project_inspect'].includes(name)) {
		return decodeInput(name, argumentsJson);
	}
	const args = record(toolArguments(argumentsJson));
	if (name === 'file_read' || name === 'file_list') {
		return readInput(name, args);
	}
	if (Object.keys(args).some((key) => !['connectionId', 'directory', 'after'].includes(key))) {
		throw new RemoteToolFailure('invalid_input');
	}
	const directory = absolutePath(args.directory);
	const input = readInput('file_list', { connectionId: args.connectionId, paths: [directory], after: args.after });
	return { connectionId: input.connectionId, directory, after: input.after };
}

export default createToolRuntime({ definitions, decode, perform: executeRemote });
