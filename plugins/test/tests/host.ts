import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { list } from 'tar';
import { z } from 'zod';
import plugin from '../package.json' with { type: 'json' };
import provider from './fixtures/provider/package.json' with { type: 'json' };

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const defaultImage =
	'ghcr.io/0honus0/nexus-terminal@sha256:d169a2852d75ea4ee184f5787163be365de95dafd6b2b1e2ae36bc79e104a440';

export const market = '/api/plugins/' + encodeURIComponent('@nexus-terminal/marketplace');

export const manager = market + '/manager';

export const pluginPath = '/api/plugins/' + encodeURIComponent(plugin.name);

export const providerPath = '/api/plugins/' + encodeURIComponent(provider.name);

export const backupPath = '/api/plugins/' + encodeURIComponent('@nexus-terminal/backup');

const OperationSchema = z.object({ id: z.string(), state: z.string(), finishedAt: z.string().optional() });

interface Fixture {
	readonly directory: string;
	readonly archive?: string;
}

interface FixtureManifest {
	readonly name: string;
	readonly version: string;
	readonly nexus: { readonly entry: Record<string, string> };
}

export function pluginFixture(directory: URL, id: string): Fixture {
	const candidates = JSON.parse(process.env.NEXUS_TEST_PLUGIN_ARTIFACTS ?? '{}') as Record<
		string,
		string | undefined
	>;
	return { directory: fileURLToPath(directory), archive: candidates[id] };
}

async function pack(fixture: Fixture, files: string, manifest: FixtureManifest) {
	let archive = fixture.archive;
	if (!archive) {
		await exec('pnpm', ['--dir', fixture.directory, 'pack', '--pack-destination', files], { timeout: 15000 });
		const [name] = await readdir(files);
		assert.ok(name);
		archive = join(files, name);
	}

	const entries: string[] = [];
	await list({
		file: archive,

		onentry(entry) {
			entries.push(entry.path);
		},
	});
	for (const entry of Object.values(manifest.nexus.entry)) assert.ok(entries.includes('package/' + entry));
	assert.ok(
		entries.every(
			(path) => path === 'package/package.json' || path === 'package/README.md' || /^package\/dist\//u.test(path),
		),
	);
	return readFile(archive);
}

export async function until<Value>(read: () => Promise<Value | undefined>): Promise<Value> {
	const deadline = AbortSignal.timeout(15000);
	for (;;) {
		deadline.throwIfAborted();
		const result = await read();
		if (result !== undefined) return result;
		await delay(50, undefined, { signal: deadline });
	}
}

export async function startHost(
	resources: AsyncDisposableStack,
	target = plugin.name,
	fixtures: readonly Fixture[] = [{ directory: root }, { directory: join(root, 'tests/fixtures/provider') }],
) {
	const fixtureToken = randomUUID();
	const working = await mkdtemp(join(tmpdir(), 'nexus-external-sdk-'));
	resources.defer(() => rm(working, { recursive: true, force: true }));
	const archives = new Map<string, Buffer>();
	const packages = await Promise.all(
		fixtures.map(async (fixture, index) => {
			const directory = await mkdtemp(join(working, 'package-'));
			const manifest = JSON.parse(
				await readFile(join(fixture.directory, 'package.json'), 'utf8'),
			) as FixtureManifest;
			const endpoint = `/package-${index}.tgz`;
			archives.set(endpoint, await pack(fixture, directory, manifest));
			return [manifest, endpoint] as const;
		}),
	);
	const targetPackage = packages.find(([manifest]) => manifest.name === target)?.[0];
	assert.ok(targetPackage);

	let catalog: unknown;
	const repository = createServer((request, response) => {
		const path = request.url ?? '';
		if (path === '/catalog.json') return response.end(JSON.stringify(catalog));
		const artifact = archives.get(path);
		if (!artifact) return response.writeHead(404).end();
		return response.end(artifact);
	});
	resources.defer(() => {
		repository.closeAllConnections();
		if (repository.listening) return new Promise<void>((resolve) => repository.close(() => resolve()));
	});
	repository.listen(0, '0.0.0.0');
	await once(repository, 'listening');
	const address = repository.address();
	assert.ok(address && typeof address !== 'string');
	const remote = 'http://sdk-repository.test:' + address.port;

	catalog = packages.map(([manifest, path]) => ({
		id: manifest.name,
		versions: [
			{
				package: manifest,
				distributions: [
					{
						tarball: remote + path,
						integrity: 'sha512-' + createHash('sha512').update(archives.get(path)!).digest('base64'),
					},
				],
			},
		],
	}));

	const { stdout } = await exec(
		'docker',
		[
			'run',
			'--detach',
			'--volume',
			'/app/data',
			'--publish',
			'127.0.0.1::8080',
			'--add-host',
			'sdk-repository.test:host-gateway',
			'--env',
			'NEXUS_SDK_FIXTURE_TOKEN',
			process.env.NEXUS_TEST_IMAGE ?? defaultImage,
		],
		{ env: { ...process.env, NEXUS_SDK_FIXTURE_TOKEN: fixtureToken }, timeout: 90000 },
	);
	const container = stdout.trim();
	resources.defer(async () => {
		await exec('docker', ['rm', '--force', '--volumes', container], { timeout: 10000 });
	});
	const { stdout: port } = await exec('docker', ['port', container, '8080/tcp']);
	const origin = 'http://' + port.trim();
	await until(async () => {
		const response = await fetch(origin + '/api/auth/state', { signal: AbortSignal.timeout(3000) }).catch(
			() => undefined,
		);
		await response?.body?.cancel();
		return response?.ok || undefined;
	});

	const login = await fetch(origin + '/api/auth/initialize', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ username: 'owner', password: 'sdk-fixture-password' }),
	});
	assert.equal(login.status, 201, await login.clone().text());
	const session = login.headers.get('set-cookie')?.split(';', 1)[0];
	assert.ok(session);
	const cookie = session;
	await login.body?.cancel();

	function request(path: string, init?: RequestInit): Promise<Response> {
		const headers = new Headers(init?.headers);
		headers.set('cookie', cookie);
		return fetch(origin + path, { ...init, headers, signal: init?.signal ?? AbortSignal.timeout(10000) });
	}

	async function json(path: string, input?: object, method = input ? 'POST' : 'GET', status = 200): Promise<unknown> {
		const response = await request(path, {
			method,
			headers: input && { 'content-type': 'application/json' },
			body: input && JSON.stringify(input),
		});
		assert.equal(response.status, status, path + ' ' + (await response.clone().text()));
		return response.json();
	}

	async function operation(path: string, input: object, method = 'POST'): Promise<void> {
		const { id } = OperationSchema.parse(await json(path, input, method, 202));
		const status = await until(async () => {
			const current = OperationSchema.parse(await json(manager + '/operations/' + id));
			if (current.finishedAt) return current;
		});
		assert.equal(status.state, 'succeeded', JSON.stringify(status));
	}

	const source = z
		.object({ id: z.uuid() })
		.parse(await json(market + '/repositories', { url: remote + '/catalog.json' }, 'POST', 201));
	const plan = z
		.object({ blockers: z.array(z.unknown()), steps: z.array(z.unknown()) })
		.passthrough()
		.parse(
			await json(manager + '/install-plan', {
				kind: 'repository',
				repositoryId: source.id,
				pluginId: targetPackage.name,
				version: targetPackage.version,
			}),
		);
	assert.deepEqual(plan.blockers, []);
	assert.equal(plan.steps.length, packages.length);
	await operation(manager + '/install', { plan });

	async function logs(): Promise<string> {
		const { stdout } = await exec('docker', ['logs', container], { timeout: 5000 });
		return stdout;
	}

	return { origin, fixtureToken, request, json, operation, logs };
}

export async function setEnabled(
	host: Awaited<ReturnType<typeof startHost>>,
	id: string,
	enabled: boolean,
): Promise<void> {
	await host.operation(manager + '/plugins/' + encodeURIComponent(id), { enabled }, 'PATCH');
}

export async function uninstall(host: Awaited<ReturnType<typeof startHost>>, id: string): Promise<void> {
	const endpoint = manager + '/plugins/' + encodeURIComponent(id);
	const { revision } = z.object({ revision: z.string() }).parse(await host.json(endpoint + '/uninstall-plan'));
	await host.operation(manager + '/uninstall', { pluginId: id, revision, data: 'keep' });
}
