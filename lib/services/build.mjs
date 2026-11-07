import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Bundle the official SDK closure into the signed package; no runtime node_modules is installed. */
export async function buildServiceBackend(root) {
	const result = await build({
		entryPoints: [path.join(root, 'src/index.mjs')],
		outfile: path.join(root, 'backend/index.mjs'),
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node26',
		legalComments: 'eof',
		metafile: true,
	});
	const packageRoots = new Set();
	const inputs = [];
	for (const filename of Object.keys(result.metafile.inputs).sort()) {
		const absolute = path.resolve(filename);
		const bytes = await fs.readFile(absolute);
		inputs.push({
			path: filename,
			sha256: createHash('sha256').update(bytes).digest('hex'),
			sizeBytes: bytes.byteLength,
		});
		if (filename.includes('node_modules/')) {
			let directory = path.dirname(absolute);
			for (;;) {
				try {
					const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
					if (typeof pkg.name === 'string' && typeof pkg.version === 'string') {
						packageRoots.add(directory);
						break;
					}
				} catch (error) {
					if (error.code !== 'ENOENT') {
						throw error;
					}
				}
				const parent = path.dirname(directory);
				if (parent === directory) {
					throw new Error('SERVICE_DEPENDENCY_ORIGIN_MISSING');
				}
				directory = parent;
			}
		}
	}
	const notices = [];
	for (const directory of [...packageRoots].sort()) {
		const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
		if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
			throw new Error('SERVICE_DEPENDENCY_IDENTITY_MISSING');
		}
		const licenses = (await fs.readdir(directory)).filter((name) => /^(license|licence|notice)(\.|$)/iu.test(name));
		const texts = await Promise.all(
			licenses.map(async (name) => `${name}\n${await fs.readFile(path.join(directory, name), 'utf8')}`),
		);
		if (!texts.length && pkg.name !== '@nexus-terminal/shared') {
			throw new Error(`SERVICE_DEPENDENCY_LICENSE_MISSING:${pkg.name}`);
		}
		notices.push(
			`${pkg.name}@${pkg.version}\nLicense: ${pkg.license ?? 'See source package'}\n${texts.join('\n\n')}`,
		);
	}
	const outputs = Object.values(result.metafile.outputs);
	for (const output of outputs) {
		for (const imported of output.imports) {
			if (!imported.path.startsWith('node:')) {
				throw new Error(`SERVICE_RUNTIME_DEPENDENCY_UNBUNDLED:${imported.path}`);
			}
		}
	}
	await fs.writeFile(
		path.join(root, 'backend/THIRD-PARTY-NOTICES.txt'),
		notices.join('\n\n--------------------\n\n') + '\n',
	);
	await fs.writeFile(
		path.join(root, 'backend/build-inputs.json'),
		JSON.stringify(
			{ format: 1, inputs, outputs: outputs.map((output) => ({ bytes: output.bytes, imports: output.imports })) },
			null,
			2,
		) + '\n',
	);
}
