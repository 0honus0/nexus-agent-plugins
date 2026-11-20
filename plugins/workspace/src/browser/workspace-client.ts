import { z } from 'zod';
import { PluginHttpError, type PluginContextApi } from 'nexus-terminal/browser';
import { describeWorkspaceError } from './workspace-error.js';

export function isHttpRequestCanceled(cause: unknown): boolean {
	return cause instanceof DOMException && cause.name === 'AbortError';
}

/** Host authentication is inherited; callers select a view or plugin lifetime. */
export function createWorkspaceClient(ctx: PluginContextApi, signal: AbortSignal) {
	const url = (path: string) => ctx.app.http.url(path);

	function request(path: string, method?: string, data?: unknown): Promise<unknown>;
	function request<Schema extends z.ZodType>(
		path: string,
		method: string | undefined,
		data: unknown,
		schema: Schema,
	): Promise<z.output<Schema>>;

	function request(path: string, method = 'GET', data?: unknown, schema: z.ZodType = z.unknown()) {
		return ctx.app.http.json(path, schema, {
			method,
			signal,
			...(data === undefined
				? {}
				: {
						body: JSON.stringify(data),
						headers: { 'content-type': 'application/json' },
					}),
		});
	}

	async function binary(path: string, options: RequestInit): Promise<Response> {
		const response = await ctx.app.http.request(path, { ...options, signal: options.signal ?? signal });
		if (!response.ok) {
			const code = z.object({ code: z.string() }).safeParse(await response.json().catch(() => undefined));
			throw new PluginHttpError(response.status, code.data?.code ?? 'WORKSPACE_OPERATION_FAILED');
		}
		return response;
	}

	return {
		url,
		request,
		binary,

		report(cause: unknown) {
			if (signal.aborted || isHttpRequestCanceled(cause)) return;
			const error = describeWorkspaceError(cause, 'request', 'WORKSPACE_OPERATION_FAILED');
			const code = typeof error.code === 'string' ? error.code : 'WORKSPACE_OPERATION_FAILED';
			ctx.app.log.report({ level: 'error', code, userVisible: true });
		},
	};
}
