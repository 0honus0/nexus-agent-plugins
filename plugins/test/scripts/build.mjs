import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

await Promise.all(
	['../dist', '../tests/fixtures/provider/dist'].map((directory) =>
		rm(fileURLToPath(new URL(directory, import.meta.url)), { recursive: true, force: true }),
	),
);

const entries = [
	['../src/node/index.ts', '../dist/node', false],
	['../src/browser/index.ts', '../dist/browser', true],
	['../tests/fixtures/provider/node.ts', '../tests/fixtures/provider/dist/node', false],
	['../tests/fixtures/provider/browser.ts', '../tests/fixtures/provider/dist/browser', true],
];

for (const [source, destination, browser] of entries) {
	await build({
		configFile: false,
		publicDir: false,
		plugins: browser ? [vue()] : [],
		build: {
			outDir: fileURLToPath(new URL(destination, import.meta.url)),
			emptyOutDir: true,
			target: 'es2022',
			lib: {
				entry: fileURLToPath(new URL(source, import.meta.url)),
				formats: ['es'],
				fileName: 'index',
			},
			rolldownOptions: {
				external: [...(browser ? ['vue', 'vue-i18n'] : [/^node:/u]), /^nexus-terminal\//u],
			},
		},
	});
}
