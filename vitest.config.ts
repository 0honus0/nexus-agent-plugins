import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const artifactRoot = process.env.NEXUS_TEST_ARTIFACT_DIR;

export default defineConfig({
	root: import.meta.dirname,
	resolve: {
		alias: [
			{ find: '@', replacement: source('./plugins/nexus.ui.chat/src') },
			{ find: 'nexus:frontend-sdk', replacement: source('./sdk/frontend-v4.mjs') },
		],
		dedupe: ['vue'],
	},
	test: {
		include: ['plugins/*/tests/**/*.test.{ts,mjs}'],
		exclude: ['**/node_modules/**', '**/support/**', '**/*.native.test.mjs'],
		environment: 'node',
		allowOnly: !process.env.CI,
		retry: 0,
		reporters: artifactRoot
			? ['default', ['json', { outputFile: artifactRoot + '/reports/vitest.json' }]]
			: ['default'],
	},
});
