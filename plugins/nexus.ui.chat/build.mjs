import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const output = path.join(root, 'frontend');

const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (!fs.statSync(path.join(dist, 'index.html')).isFile()) {
	throw new Error('CHAT_UI_BUILD_MISSING');
}
const css = fs
	.readdirSync(path.join(dist, 'assets'))
	.filter((name) => name.endsWith('.css'))
	.map((name) => fs.readFileSync(path.join(dist, 'assets', name), 'utf8'))
	.join('\n');
for (const utility of ['grid', 'flex', 'h-full', 'hidden']) {
	if (!new RegExp('\\.' + utility + '\\s*\\{', 'u').test(css)) {
		throw new Error(`CHAT_UI_UTILITY_MISSING:${utility}`);
	}
}

// Generate provenance from the current source owner after a successful local build.
// Editing this plugin never requires re-copying source or approving a frozen Host snapshot.
function sources(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			return sources(filename);
		}
		if (!entry.isFile()) {
			throw new Error(`CHAT_UI_SOURCE_NOT_REGULAR:${filename}`);
		}
		return [filename];
	});
}

const files = [
	...sources(path.join(root, 'src')),
	...[
		'index.html',
		'package.json',
		'tsconfig.json',
		'vite.config.ts',
		'manifest.json',
		'build.mjs',
		'eslint.config.mjs',
	].map((name) => path.join(root, name)),
].sort();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const sdk = ['@nexus-terminal/shared'].map((name) => {
	const reference = pkg.dependencies[name];
	if (typeof reference !== 'string' || !reference.startsWith('file:')) {
		throw new Error(`CHAT_UI_SDK_REFERENCE:${name}`);
	}
	return { name, reference, sha256: fingerprint(fs.readFileSync(path.resolve(root, reference.slice(5)))) };
});
fs.writeFileSync(
	path.join(root, 'SOURCE-MANIFEST.json'),
	JSON.stringify(
		{
			format: 2,
			owner: 'plugins/nexus.ui.chat',
			sdk,
			hostRuntime: { module: '/sdk/frontend-v4.mjs', frontendSdk: 4 },
			files: files.map((filename) => ({
				path: path.relative(root, filename).split(path.sep).join('/'),
				sha256: fingerprint(fs.readFileSync(filename)),
			})),
		},
		null,
		2,
	) + '\n',
);
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(dist, output, { recursive: true });
console.log(`Chat UI runtime assets built at ${output}`);
