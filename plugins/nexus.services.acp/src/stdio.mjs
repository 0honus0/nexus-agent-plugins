import { AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES } from '@nexus-terminal/shared/agent/plugins/values';
import { collectFailures } from '../../../lib/services/failure.mjs';

/** Raw command bridge only. ACP bytes and permission serialization belong to the official SDK adapter. */
export class ManagedAcpStdio {
	constructor(call, channelId, closeSession) {
		this.call = call;
		this.closeSession = closeSession;
		this.closePromise = null;
		this.channelId = channelId;
		this.tasks = new Set();
		this.failures = [];
		this.closing = false;
		this.stderr = this.track(this.drainStderr());
	}

	static async open(call, grant, closeSession) {
		const opened = await call('transport.stdio.open', { grant });
		return new ManagedAcpStdio(call, opened.channelId, closeSession);
	}

	track(task) {
		this.tasks.add(task);
		void task
			.catch((error) => {
				if (!this.closing) {
					this.failures.push(error);
				}
			})
			.finally(() => this.tasks.delete(task));
		return task;
	}

	async drainStderr() {
		while (!this.closing) {
			const value = await this.call('transport.stdio.read', { channelId: this.channelId, stream: 'stderr' });
			if (value.eof) {
				return;
			}
		}
	}

	async read() {
		const value = await this.track(
			this.call('transport.stdio.read', { channelId: this.channelId, stream: 'stdout' }),
		);
		return { bytes: Buffer.from(value.bytesBase64, 'base64'), eof: value.eof };
	}

	write(bytes, permissionGrant) {
		return this.track(this.writeChunks(bytes, permissionGrant));
	}

	async writeChunks(bytes, permissionGrant) {
		// NDJSON frames can exceed one Host RPC. Ordinary bytes are split in order;
		// an approval response stays one write so its delivery grant is consumed once.
		const chunkBytes = Math.floor(AGENT_PLUGIN_APP_PAYLOAD_MAX_BYTES / 4) * 3;
		for (let offset = 0; offset < bytes.byteLength;) {
			const end = permissionGrant === null ? Math.min(bytes.byteLength, offset + chunkBytes) : bytes.byteLength;
			await this.call('transport.stdio.write', {
				channelId: this.channelId,
				bytesBase64: Buffer.from(bytes.subarray(offset, end)).toString('base64'),
				permissionGrant,
			});
			offset = end;
		}
	}

	permission(input) {
		return this.track(this.call('transport.permission.request', { channelId: this.channelId, ...input }));
	}

	close() {
		if (this.closePromise) {
			return this.closePromise;
		}
		this.closing = true;
		this.closePromise = Promise.resolve().then(async () => {
			// ACP servers may stay alive after end_turn. The Host closes the owned channel
			// before waiting for outstanding reads, rather than waiting for process exit.
			const closed = await Promise.allSettled([this.closeSession()]);
			await Promise.allSettled([...this.tasks]);
			collectFailures(
				[...closed, ...this.failures.map((reason) => ({ status: 'rejected', reason }))],
				null,
				'ACP stdio drain failed',
			);
		});
		return this.closePromise;
	}
}
