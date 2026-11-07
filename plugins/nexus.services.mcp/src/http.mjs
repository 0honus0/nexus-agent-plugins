import { collectFailures } from '../../../lib/services/failure.mjs';
import { MCP_SYNTHETIC_URL } from './protocol.mjs';

/** A FetchLike with no ambient network path; every byte uses this invocation's Host lease. */
export class ManagedMcpHttp {
	constructor(call, leaseId, signal, closeSession) {
		this.call = call;
		this.leaseId = leaseId;
		this.signal = signal;
		this.closeSession = closeSession;
		this.sessionClosing = null;
		this.closePromise = null;
		this.requests = new Set();
		this.tasks = new Set();
		this.cleanupFailures = [];
		this.closed = false;
		this.fetch = this.fetch.bind(this);
	}

	static async open(call, grant, signal, closeSession) {
		const lease = await call('transport.http.open', { grant });
		return new ManagedMcpHttp(call, lease.leaseId, signal, closeSession);
	}

	async cancel(requestId) {
		if (this.requests.delete(requestId)) {
			if (this.signal.aborted) {
				await (this.sessionClosing ??= Promise.resolve().then(this.closeSession));
			} else {
				await this.call('transport.http.cancel', { requestId });
			}
		}
	}

	track(task, cleanup = false) {
		this.tasks.add(task);
		void task.then(
			() => this.tasks.delete(task),
			(error) => {
				this.tasks.delete(task);
				if (cleanup) {
					this.cleanupFailures.push(error);
				}
			},
		);
		return task;
	}

	async fetch(url, init = {}) {
		const signal = init.signal === undefined ? this.signal : AbortSignal.any([this.signal, init.signal]);
		signal.throwIfAborted();
		if (
			this.closed ||
			String(url) !== MCP_SYNTHETIC_URL ||
			!['GET', 'POST', 'DELETE'].includes(init.method ?? 'GET') ||
			(init.body != null && typeof init.body !== 'string')
		) {
			throw new Error('MCP_MANAGED_FETCH_INVALID');
		}
		const head = await this.call('transport.http.request', {
			leaseId: this.leaseId,
			method: init.method ?? 'GET',
			headers: [...new Headers(init.headers)].map(([name, value]) => ({ name, value })),
			bodyUtf8: init.body ?? null,
		});
		this.requests.add(head.requestId);
		let finished = false;
		let controller = null;

		const abort = () => {
			if (!finished) {
				finished = true;
				controller?.error(signal.reason);
				this.track(this.cancel(head.requestId), true);
			}
		};

		signal.addEventListener('abort', abort, { once: true });

		const finish = () => {
			signal.removeEventListener('abort', abort);
			finished = true;
		};

		if (signal.aborted) {
			abort();
			await Promise.all(this.tasks);
			signal.throwIfAborted();
		}
		if (!head.hasBody) {
			finish();
			this.requests.delete(head.requestId);
			return new Response(null, {
				status: head.status,
				statusText: head.statusText,
				headers: head.headers.map(({ name, value }) => [name, value]),
			});
		}
		const body = new ReadableStream(
			{
				start(value) {
					controller = value;
				},

				pull: async (value) => {
					try {
						const next = await this.track(this.call('transport.http.read', { requestId: head.requestId }));
						if (finished) {
							return;
						}
						const bytes = Buffer.from(next.bytesBase64, 'base64');
						if (bytes.byteLength) {
							value.enqueue(bytes);
						}
						if (next.eof) {
							finish();
							this.requests.delete(head.requestId);
							value.close();
						}
					} catch (error) {
						if (!finished) {
							finish();
							value.error(error);
						}
					}
				},

				cancel: async () => {
					finish();
					await this.cancel(head.requestId);
				},
			},
			{ highWaterMark: 0 },
		);
		return new Response(body, {
			status: head.status,
			statusText: head.statusText,
			headers: head.headers.map(({ name, value }) => [name, value]),
		});
	}

	close(releaseLease = true) {
		if (this.closePromise) {
			return this.closePromise;
		}
		this.closed = true;
		this.closePromise = Promise.resolve().then(async () => {
			const canceled = await Promise.allSettled([...this.requests].map((requestId) => this.cancel(requestId)));
			// Read failures belong to their original response consumer; closing a response
			// deliberately rejects a pending read. Only failed cleanup is aggregated here.
			await Promise.allSettled([...this.tasks]);
			const closed =
				releaseLease && !this.signal.aborted
					? await Promise.allSettled([this.call('transport.http.close', { leaseId: this.leaseId })])
					: [];
			collectFailures(
				[...canceled, ...closed, ...this.cleanupFailures.map((reason) => ({ status: 'rejected', reason }))],
				null,
				'MCP HTTP drain failed',
			);
		});
		return this.closePromise;
	}
}
