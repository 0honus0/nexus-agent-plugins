import type { WebSocket } from 'ws';
import type { RemoteToolsSessionApi } from '@nexus-terminal/remote-tools/remote-tools-api';
import type { PluginLogApi } from 'nexus-terminal/node';
import { describeWorkspaceStatusError } from './workspace-error';
import type { StatusEvent } from '../shared/workspace-status-types';
import { WorkspaceError } from './workspace-error';

/** Owns only WS scheduling. Remote tools owns collection; the caller owns SSH. */
export function createWorkspaceStatus(tools: RemoteToolsSessionApi, log: PluginLogApi) {
	let socket: WebSocket | undefined, controller: AbortController | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let collecting: Promise<void> = Promise.resolve();

	function stop() {
		clearTimeout(timer);
		controller?.abort();
		controller = undefined;
		const previous = socket;
		socket = undefined;
		previous?.close(1000);
		tools.resetStatus();
	}

	function attach(next: WebSocket) {
		if (disposed) throw new WorkspaceError('WORKSPACE_SESSION_NOT_FOUND', 404);
		if (socket) throw new WorkspaceError('WORKSPACE_ALREADY_ATTACHED', 409);
		socket = next;
		controller = new AbortController();
		const scope = controller;
		let failed = false;

		const send = (event: StatusEvent) => {
			if (scope.signal.aborted || socket !== next || next.readyState !== 1) return;
			if (next.bufferedAmount > 65536) next.close(1013);
			else next.send(JSON.stringify(event));
		};

		const sample = async () => {
			if (scope.signal.aborted) return;
			try {
				const status = await tools.getStatus({ signal: scope.signal });
				if (scope.signal.aborted) return;
				send({ type: 'sample', sample: status });
				failed = false;
			} catch (cause) {
				if (scope.signal.aborted) return;
				tools.resetStatus();
				const error = describeWorkspaceStatusError(cause);
				send({ type: 'error', error });
				if (!failed)
					log.report({
						level: 'warn',
						code: /^[A-Z][A-Z0-9_]*$/u.test(String(error.code))
							? String(error.code)
							: 'WORKSPACE_STATUS_UNAVAILABLE',
					});
				failed = true;
			} finally {
				if (!scope.signal.aborted)
					timer = setTimeout(() => {
						collecting = sample();
					}, 3000);
			}
		};

		// A new subscriber waits for the prior aborted read to finish; sampling never overlaps.
		collecting = collecting.then(sample);
		next.once('close', () => {
			if (socket === next) stop();
		});
		next.on('error', () => {
			if (socket === next) stop();
		});
		next.on('message', () => next.close(1008));
		if (next.readyState !== 1) stop();
	}

	return {
		attach,
		stop,

		async dispose() {
			disposed = true;
			stop();
			await collecting;
		},
	};
}
