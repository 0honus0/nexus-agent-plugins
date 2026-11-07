import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const frontendSdkUrl = '/sdk/frontend-v4.mjs';
const repository = path.resolve(root, '../../../..');
function publicSdk(): Plugin {
	return {
		name: 'service-settings-public-sdk',
		enforce: 'pre',
		resolveId(source) {
			if (source === 'nexus:frontend-sdk') return { id: frontendSdkUrl, external: 'absolute' };
		},
	};
}
function sourceBoundary(): Plugin {
	return {
		name: 'service-settings-source-boundary',
		generateBundle() {
			for (const module of this.getModuleIds()) {
				if (module === frontendSdkUrl) continue;
				const filename = module.split('?')[0];
				if (!filename || !path.isAbsolute(filename) || filename.includes('/node_modules/')) continue;
				const relative = path.relative(repository, filename);
				if (relative.startsWith('..') || path.isAbsolute(relative))
					throw new Error('Settings imported source outside the plugin repository');
			}
		},
	};
}
export default defineConfig({
	root,
	base: './',
	plugins: [publicSdk(), sourceBoundary(), vue(), tailwindcss()],
	resolve: { alias: { '@settings-ui': path.join(repository, 'lib/settings-ui') } },
	build: { target: 'es2025', outDir: path.resolve(root, '../../frontend'), emptyOutDir: true, assetsInlineLimit: 0 },
});
