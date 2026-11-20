import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const targets = { node: manifest.nexus.entry.backend, browser: manifest.nexus.entry.frontend };

for (const [target, output] of Object.entries(targets)) {
	if (!output) continue;
	const browser = target === 'browser';
	await build({
		publicDir: false,
		plugins: browser ? [vue()] : [],
		ssr: { noExternal: true },
		build: {
			ssr: !browser,
			target: browser ? 'es2022' : 'node26',
			outDir: resolve('dist', target),
			emptyOutDir: true,
			license: { fileName: 'third-party-licenses.md' },
			lib: {
				entry: {
					index: resolve('src', target, 'index.ts'),
					// Runtime subpath exports are bundled alongside the declared plugin entry.
					...Object.fromEntries(
						Object.entries(manifest.exports ?? {})
							.filter(([, entry]) => entry.import?.startsWith('./dist/' + target + '/'))
							.map(([key, entry]) => [
								key.slice(2),
								resolve(entry.types.replace('./dist/types/', './src/').replace(/\.d\.ts$/u, '.ts')),
							]),
					),
				},
				cssFileName: 'index',
				formats: ['es'],
			},
			rolldownOptions: {
				external: (id) =>
					isBuiltin(id) ||
					id.startsWith('nexus-terminal/') ||
					(browser && (id === 'vue' || id === 'vue-i18n')),
			},
		},
	});
}

execFileSync('pnpm', ['exec', 'vue-tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
