import { createServiceRuntime } from '../../../lib/services/runtime.mjs';
import { ServiceFailure, record, collectFailures } from '../../../lib/services/failure.mjs';
import { methods } from './contracts.mjs';
import { executeAcpProtocol } from './protocol.mjs';
import { ManagedAcpStdio } from './stdio.mjs';

async function perform(method, input, context) {
	const args = record(input);
	if (method !== 'execute' || context.scope.kind !== 'run' || context.scope.operationId === null) {
		throw new ServiceFailure('invalid_input');
	}
	const session = await context.transport.open('acp:' + context.scope.operationId);

	const call = async (name, params) =>
		(await context.transport.call(session.sessionId, { method: name, params })).value;

	let io = null;
	let primary = null;
	try {
		if (session.transport.kind !== 'remoteProcess') {
			throw new ServiceFailure('invalid_input');
		}
		io = await ManagedAcpStdio.open(call, session.transport.grant, () =>
			context.transport.close(session.sessionId),
		);
		return await executeAcpProtocol(
			io,
			{
				cwd: session.transport.cwd,
				prompt: args.prompt,
				maxOutputBytes: Number.MAX_SAFE_INTEGER,
				client: { name: 'nexus.services.acp', version: '4.0.0' },
			},
			context.signal,
		);
	} catch (error) {
		primary = error;
		throw error;
	} finally {
		const process = await Promise.allSettled(io === null ? [] : [io.close()]);
		const sessionClosed = await Promise.allSettled([context.transport.close(session.sessionId)]);
		collectFailures([...process, ...sessionClosed], primary, 'ACP execution cleanup failed');
	}
}

export default createServiceRuntime({ contract: 'nexus.protocol.acp', methods, perform });
