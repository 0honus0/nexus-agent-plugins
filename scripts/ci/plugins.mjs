import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, posix, resolve } from 'node:path';
import semver from 'semver';
import { list } from 'tar';

const directoryName = /^[a-z0-9][a-z0-9-]*$/u;

export function readPlugins(root) {
	const plugins = new Map();
	for (const directory of readdirSync(join(root, 'plugins'), { withFileTypes: true })) {
		if (!directory.isDirectory()) continue;
		const name = directory.name;
		if (!directoryName.test(name)) throw new Error(`Invalid plugin directory: ${name}`);
		const path = join(root, 'plugins', name);
		const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
		if (!manifest.name || !semver.valid(manifest.version) || plugins.has(manifest.name))
			throw new Error(`Invalid or duplicate plugin manifest: ${name}`);
		plugins.set(manifest.name, { name, path, manifest });
	}
	return plugins;
}

export function selectPlugins(plugins, files, all = false) {
	const selected = new Set();
	const names = new Set([...plugins.values()].map(({ name }) => name));
	for (const file of files) {
		const [directory, name] = file.split('/');
		// A root tooling, configuration or SDK change can affect every package.
		if (directory !== 'plugins' || !names.has(name)) all = true;
		else selected.add(name);
	}
	if (all) return [...plugins.values()].map(({ name }) => name).sort();

	const affected = new Set(
		[...plugins.values()].filter(({ name }) => selected.has(name)).map(({ manifest }) => manifest.name),
	);
	for (const plugin of plugins.values()) {
		for (const dependency of dependencyOrder(plugins, plugin)) {
			if (affected.has(dependency.manifest.name)) {
				selected.add(plugin.name);
				break;
			}
		}
	}
	return [...plugins.values()]
		.map(({ name }) => name)
		.filter((name) => selected.has(name))
		.sort();
}

function dependencyOrder(plugins, plugin) {
	const ordered = new Map();
	const visiting = new Set([plugin.manifest.name]);

	function visit(owner) {
		for (const name of Object.keys(owner.manifest.nexus?.dependsOn ?? {})) {
			const dependency = plugins.get(name);
			if (!dependency || ordered.has(name)) continue;
			if (visiting.has(name)) throw new Error(`Plugin dependency cycle: ${[...visiting, name].join(' -> ')}`);

			visiting.add(name);
			visit(dependency);
			visiting.delete(name);
			ordered.set(name, dependency);
		}
	}

	visit(plugin);
	return [...ordered.values()];
}

function findPlugin(plugins, name) {
	const plugin = [...plugins.values()].find((entry) => entry.name === name);
	if (!plugin) throw new Error(`Unknown plugin: ${name}`);
	return plugin;
}

export function releasePlugin(plugins, tag) {
	const [name, version, extra] = tag.split('/');
	if (!directoryName.test(name) || !version?.startsWith('v') || extra !== undefined)
		throw new Error('Expected a plugin tag such as ssh/v0.1.3');
	const plugin = findPlugin(plugins, name);
	if (plugin.manifest.private || version !== 'v' + plugin.manifest.version)
		throw new Error(`Plugin is private or the tag does not match its package version: ${tag}`);
	return plugin;
}

function runPnpm(plugin, args, options = {}) {
	return execFileSync('pnpm', ['--dir', plugin.path, ...args], { stdio: 'inherit', ...options });
}

function pack(plugin, directory) {
	const file = join(directory, `${plugin.name}-${plugin.manifest.version}.tgz`);
	runPnpm(plugin, ['pack', '--out', file]);
	return file;
}

function testPlugin(plugins, plugin) {
	const directory = mkdtempSync(join(tmpdir(), 'nexus-plugin-tests-'));
	try {
		const artifacts = {};
		for (const dependency of dependencyOrder(plugins, plugin)) {
			runPnpm(dependency, ['build']);
			artifacts[dependency.manifest.name] = pack(dependency, directory);
		}
		if (plugin.manifest.scripts?.['test:setup']) runPnpm(plugin, ['test:setup']);
		runPnpm(plugin, ['typecheck']);
		// Integration suites install candidate dependency archives using this map.
		const env = { ...process.env, NEXUS_TEST_PLUGIN_ARTIFACTS: JSON.stringify(artifacts) };
		runPnpm(plugin, ['test'], { env });
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

async function describeArtifact(plugin, file) {
	const entries = new Set();
	let packageJson;
	await list({
		file,

		onentry(entry) {
			if (entry.type === 'File') entries.add(entry.path);
			if (entry.path !== 'package/package.json') return;
			packageJson = new Promise((resolve, reject) => {
				const chunks = [];
				entry.on('data', (chunk) => chunks.push(chunk));
				entry.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
				entry.on('error', reject);
			});
		},
	});
	if (!packageJson) throw new Error('Packed plugin has no package.json');
	const manifest = JSON.parse(await packageJson);
	if (manifest.name !== plugin.manifest.name || manifest.version !== plugin.manifest.version || manifest.private)
		throw new Error('Packed plugin identity differs from the release selection');
	const entrypoints = Object.values(manifest.nexus?.entry ?? {});
	if (!entrypoints.length || entrypoints.some((entry) => !entries.has(posix.join('package', entry))))
		throw new Error('Packed plugin is missing a manifest entrypoint');
	const integrity = 'sha512-' + createHash('sha512').update(readFileSync(file)).digest('base64');
	return { file: basename(file), package: manifest, integrity };
}

function output(name, value) {
	if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
	else console.log(value);
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
	const [command, value, destination] = process.argv.slice(2);
	const plugins = readPlugins(process.cwd());
	switch (command) {
		case 'matrix':
			output(
				'plugins',
				JSON.stringify(
					selectPlugins(
						plugins,
						JSON.parse(process.env.CHANGED_FILES ?? '[]'),
						process.env.FORCE_ALL === 'true',
					),
				),
			);
			break;
		case 'test':
			testPlugin(plugins, findPlugin(plugins, value));
			break;
		case 'release': {
			const plugin = releasePlugin(plugins, value);
			testPlugin(plugins, plugin);
			const file = pack(plugin, resolve(destination));
			const metadata = await describeArtifact(plugin, file);
			writeFileSync(join(destination, 'metadata.json'), JSON.stringify(metadata));
			break;
		}
		default:
			throw new Error('Expected matrix, test or release');
	}
}
