import { execFileSync } from 'node:child_process';
import { isBuiltin } from 'node:module';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

for (const target of ['node', 'browser']) {
	const browser = target === 'browser';
	await build({
		configFile: false,
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
				entry: resolve('src', target, 'index.ts'),
				fileName: 'index',
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
