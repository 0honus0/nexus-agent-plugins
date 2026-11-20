import { generateManifest } from 'material-icon-theme';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import type { Plugin } from 'vite';

/** Use upstream mappings at build time; browser only receives lookup tables and local SVG URLs. */
export function fileIcons(): Plugin {
	const id = 'virtual:workspace-file-icons';
	const root = dirname(createRequire(import.meta.url).resolve('material-icon-theme/package.json'));
	const manifest = generateManifest();
	return {
		name: 'workspace-file-icons',

		resolveId(source) {
			if (source === id) return '\0' + id;
		},

		load(source) {
			if (source !== '\0' + id) return;
			return `export default ${JSON.stringify(manifest)};`;
		},

		async generateBundle() {
			const names = new Set(Object.values(manifest.iconDefinitions ?? {}).map((def) => basename(def.iconPath)));
			for (const name of names)
				this.emitFile({
					type: 'asset',
					fileName: 'assets/file-icons/' + name,
					source: await readFile(join(root, 'icons', name)),
				});
			this.emitFile({
				type: 'asset',
				fileName: 'assets/file-icons/LICENSE.txt',
				source: await readFile(join(root, 'LICENSE')),
			});
		},
	};
}
