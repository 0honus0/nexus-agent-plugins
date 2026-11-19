import { Readable } from 'node:stream';
import {
	CryptoOptionsSchema,
	HttpFailure,
	PluginCryptoErrorCodeSchema,
	PluginCryptoFailureSchema,
	type HttpStreamRoute,
	type PluginContextApi,
	type WsRoute,
} from 'nexus-terminal/node';
import { z } from 'zod';
import { EmptySchema, ProviderOutputSchema, TestCryptoSchema } from '../sdk-fixture-types.js';

const binaryFixture = Buffer.from([0, 42, 255]);

export function registerSdkRoutes(context: PluginContextApi): void {
	const { app } = context;
	const echo = {
		path: '/echo',
		maxPayload: 1024,

		handler(socket, connection) {
			connection.signal.throwIfAborted();
			socket.send(connection.query.get('label') ?? 'ready');
			socket.on('message', (data, binary) => socket.send(data, { binary }));
		},
	} satisfies WsRoute;
	app.ws.register(echo);

	const binary = {
		method: 'post',
		path: '/binary',
		input: EmptySchema,
		body: 'binary',

		async handler(_input, request) {
			const chunks: Buffer[] = [];
			let total = 0;
			for await (const chunk of request.body ?? []) {
				request.signal.throwIfAborted();
				const bytes = Buffer.from(chunk);
				total += bytes.length;
				if (total > 1024) throw new HttpFailure(413, 'FIXTURE_STREAM_LIMIT');
				chunks.push(bytes);
			}
			await request.reply({
				headers: { 'content-type': request.headers['content-type'] ?? 'application/octet-stream' },
				body: Readable.from(chunks),
			});
		},
	} satisfies HttpStreamRoute<typeof EmptySchema>;

	app.http.register([
		binary,
		{
			method: 'head',
			path: '/binary',
			input: EmptySchema,

			async handler(_input, request) {
				await request.reply({ headers: { 'content-length': binaryFixture.length } });
			},
		},
		{
			method: 'get',
			path: '/conflict',
			input: EmptySchema,
			output: EmptySchema,

			handler() {
				throw new HttpFailure(409, 'SDK_TEST_CONFLICT');
			},
		},
		{
			method: 'get',
			path: '/crypto',
			input: EmptySchema,
			output: TestCryptoSchema,

			async handler(_input, signal) {
				const local = CryptoOptionsSchema.parse({ mode: 'local', context: 'probe' });
				const password = CryptoOptionsSchema.parse({ mode: 'password', password: 'fixture', context: 'probe' });
				const forged = { ...local, ownerId: 'forged' };
				const sealedLocal = await app.crypto.encrypt(binaryFixture, local);
				const sealedPassword = await app.crypto.encrypt(binaryFixture, password);
				if (sealedLocal.isErr() || sealedPassword.isErr()) throw new HttpFailure(500, 'SDK_TEST_CRYPTO_FAILED');

				const [openedLocal, openedPassword, options, envelope, authentication] = await Promise.all([
					app.crypto.decrypt(sealedLocal.value, local),
					app.crypto.decrypt(sealedPassword.value, password),
					app.crypto.decrypt(sealedLocal.value, forged),
					app.crypto.decrypt(Uint8Array.of(0), local),
					app.crypto.decrypt(sealedPassword.value, { mode: 'password', password: 'wrong', context: 'probe' }),
				]);
				signal.throwIfAborted();

				function code(result: typeof envelope): string {
					if (result.isOk()) throw new HttpFailure(500, 'SDK_TEST_CRYPTO_EXPECTED_ERROR');
					return PluginCryptoErrorCodeSchema.parse(PluginCryptoFailureSchema.parse(result.error).code);
				}

				return {
					local: openedLocal.isOk() && Buffer.from(openedLocal.value).equals(binaryFixture),
					password: openedPassword.isOk() && Buffer.from(openedPassword.value).equals(binaryFixture),
					options: code(options),
					envelope: code(envelope),
					authentication: code(authentication),
				};
			},
		},
	] as const);

	let released = false;
	const unbind = context.use({ fixture: ['@nexus-terminal/test-provider', 'fixture'] }, (scope) => {
		app.state.register({
			name: 'provider',
			schema: ProviderOutputSchema,
			initial: { value: scope.plugin.fixture.read() },
			lifetime: scope,
		});
		scope.onDispose(() => {
			released = true;
		});
		app.http.register([
			{
				method: 'get',
				path: '/dependency',
				input: EmptySchema,
				output: ProviderOutputSchema,
				lifetime: scope,

				handler() {
					return { value: scope.plugin.fixture.read() };
				},
			},
		] as const);
	});

	app.http.register([
		{
			method: 'post',
			path: '/release-dependency',
			input: EmptySchema,
			output: EmptySchema,

			handler() {
				unbind();
				return {};
			},
		},
		{
			method: 'get',
			path: '/dependency-cleanup',
			input: EmptySchema,
			output: z.object({ released: z.boolean() }),

			handler() {
				return { released };
			},
		},
	] as const);
}
