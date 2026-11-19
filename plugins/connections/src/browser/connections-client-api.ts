import type { CredentialsClientApi } from '@nexus-terminal/credentials/credentials-client-api';
import { PluginHttpError, type PluginContextApi, type PluginViewApi } from 'nexus-terminal/browser';
import { readonly, ref, shallowReadonly, shallowRef, type Ref } from 'vue';
import { z } from 'zod';
import {
	ConnectionCatalogSchema,
	ConnectionEditorRequestSchema,
	ConnectionSchema,
	ConnectionsRevisionSchema,
	type ConnectionCatalog,
	type ConnectionInput,
	type ConnectionEditorRequest,
} from '../shared/connection-types.js';

export type {
	Connection,
	ConnectionCatalog,
	ConnectionInput,
	ConnectionEditorRequest,
	ConnectionType,
	Tag,
} from '../shared/connection-types.js';

export interface ConnectionsClientApi {
	readonly catalog: Readonly<Ref<ConnectionCatalog>>;
	refresh(signal?: AbortSignal): Promise<void>;
	openManager(): void;
	openEditor(request: ConnectionEditorRequest, signal?: AbortSignal): Promise<void>;
}

declare module 'nexus-terminal/browser' {
	interface PluginServicesApi {
		readonly '@nexus-terminal/connections': { readonly connections: ConnectionsClientApi };
	}
}

export class ConnectionsClient implements ConnectionsClientApi {
	readonly #catalog = shallowRef<ConnectionCatalog>({ connections: [], tags: [] });
	readonly #requests = ref(0);
	readonly #loaded = ref(false);
	readonly #credentials = shallowRef<CredentialsClientApi>();
	readonly #editor = shallowRef<ConnectionEditorRequest>();
	readonly catalog = shallowReadonly(this.#catalog);
	readonly loaded = readonly(this.#loaded);
	readonly requests = readonly(this.#requests);
	readonly credentials = shallowReadonly(this.#credentials);
	readonly editorRequest = shallowReadonly(this.#editor);
	#subscribed = false;
	#requested = 0;
	#applied = 0;
	#navigation = 0;

	readonly #context: PluginContextApi;

	constructor(ctx: PluginContextApi) {
		this.#context = ctx;
		ctx.use({ credentials: ['@nexus-terminal/credentials', 'credentials'] }, (scope) => {
			this.#credentials.value = scope.plugin.credentials;
			scope.onDispose(() => {
				this.#credentials.value = undefined;
			});
		});
	}

	openManager(): void {
		this.#context.app.windows.open('main');
	}

	async openEditor(input: ConnectionEditorRequest, signal?: AbortSignal): Promise<void> {
		const request = ConnectionEditorRequestSchema.parse(input);
		const navigation = ++this.#navigation;
		await this.refresh(signal);
		this.#context.signal.throwIfAborted();
		signal?.throwIfAborted();
		if (navigation !== this.#navigation) return;
		if (!this.#catalog.value.connections.some(({ id }) => id === request.connectionId))
			throw new Error('CONNECTIONS_NOT_FOUND');

		const previous = this.#editor.value;
		this.#editor.value = request;
		try {
			this.openManager();
		} catch (cause) {
			this.#editor.value = previous;
			throw cause;
		}
	}

	clearEditorRequest(request: ConnectionEditorRequest): void {
		if (this.#editor.value === request) this.#editor.value = undefined;
	}

	async refresh(signal?: AbortSignal): Promise<void> {
		this.#context.signal.throwIfAborted();
		signal?.throwIfAborted();

		if (!this.#subscribed) {
			this.#subscribed = true;
			this.#context.app.state.subscribe('connections', ConnectionsRevisionSchema, {
				updated: () => void this.refresh().catch((cause) => this.report(cause, undefined, false)),
			});
		}
		const request = ++this.#requested;
		this.#requests.value++;
		try {
			const data = await this.#context.app.http.json('/catalog', ConnectionCatalogSchema, { signal });
			this.#context.signal.throwIfAborted();
			signal?.throwIfAborted();
			if (request < this.#applied) return;
			this.#applied = request;
			this.#catalog.value = data;
			this.#loaded.value = true;
		} finally {
			this.#requests.value--;
		}
	}

	report(cause: unknown, signal?: AbortSignal, userVisible = true): void {
		if (this.#context.signal.aborted || signal?.aborted) return;
		const code =
			cause instanceof PluginHttpError
				? cause.code
				: cause instanceof Error && /^CONNECTIONS_[A-Z_]+$/u.test(cause.message)
					? cause.message
					: 'CONNECTIONS_OPERATION_FAILED';
		this.#context.app.log.report({ level: 'error', code, userVisible });
	}

	save(connection: ConnectionInput, id: string | undefined, view: PluginViewApi) {
		return this.#context.app.tasks.run(
			async (signal) => {
				const result = await this.#context.app.http.json(
					id ? '/connections/' + encodeURIComponent(id) : '/connections',
					ConnectionSchema,
					{
						method: id ? 'PUT' : 'POST',
						signal,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ connection }),
					},
				);
				signal.throwIfAborted();
				this.#context.app.log.report({ level: 'info', code: 'CONNECTION_SAVED', userVisible: true });
				return result;
			},
			{ view },
		);
	}

	remove(id: string, view: PluginViewApi) {
		return this.#delete('/connections/' + encodeURIComponent(id), 'CONNECTION_DELETED', view);
	}

	removeTag(id: string, view: PluginViewApi) {
		return this.#delete('/tags/' + encodeURIComponent(id), 'CONNECTION_TAG_DELETED', view);
	}

	#delete(path: string, code: string, view: PluginViewApi) {
		return this.#context.app.tasks.run(
			async (signal) => {
				await this.#context.app.http.json(path, z.undefined(), { method: 'DELETE', signal });
				signal.throwIfAborted();
				this.#context.app.log.report({ level: 'info', code, userVisible: true });
			},
			{ view },
		);
	}
}
