import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const frontendSdkUrl = '/sdk/frontend-v4.mjs';

function hostFrontendSdk(): Plugin {
	return {
		name: 'nexus-chat-host-sdk',
		enforce: 'pre',
		resolveId(source) {
			if (source === 'nexus:frontend-sdk') {
				return { id: frontendSdkUrl, external: 'absolute' };
			}
		},
	};
}

function localSourceBoundary(): Plugin {
	return {
		name: 'nexus-chat-local-source',
		generateBundle() {
			for (const module of this.getModuleIds()) {
				if (module === frontendSdkUrl) continue;
				const filename = module.split('?')[0];
				if (!filename || !path.isAbsolute(filename) || filename.includes('/node_modules/')) continue;
				const relative = path.relative(root, filename);
				if (relative.startsWith('..') || path.isAbsolute(relative))
					throw new Error('Chat UI imports source outside its plugin: ' + filename);
			}
		},
	};
}

export default defineConfig({
	root,
	base: './',
	plugins: [hostFrontendSdk(), localSourceBoundary(), vue(), tailwindcss()],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	build: { target: 'es2025', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 3000 },
});
