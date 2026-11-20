import { generateManifest } from 'material-icon-theme';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import type { Plugin } from 'vite';

/** Use upstream mappings at build time; inline common icons and leave uncommon ones as lazy assets. */
export function fileIcons(): Plugin {
	const id = 'virtual:workspace-file-icons';
	const root = dirname(createRequire(import.meta.url).resolve('material-icon-theme/package.json'));
	const manifest = generateManifest();
	const commonExtensions = [
		'txt',
		'md',
		'log',
		'json',
		'yaml',
		'yml',
		'toml',
		'ini',
		'conf',
		'sh',
		'js',
		'ts',
		'vue',
		'css',
		'html',
		'py',
		'zip',
		'tar',
		'gz',
		'png',
		'jpg',
		'svg',
		'pdf',
	];
	const commonFolders = ['src', 'bin', 'etc', 'home', 'tmp', 'lib', 'dist', 'public', 'node_modules', '.git'];
	const commonIcons = new Set(
		[
			manifest.file,
			manifest.folder,
			...commonExtensions.map((ext) => manifest.fileExtensions?.[ext]),
			...commonFolders.map((name) => manifest.folderNames?.[name]),
			...['package.json', 'dockerfile', '.gitignore', '.env'].map((name) => manifest.fileNames?.[name]),
		].flatMap((key) => {
			const definition = key && manifest.iconDefinitions?.[key];
			return definition ? [basename(definition.iconPath)] : [];
		}),
	);
	return {
		name: 'workspace-file-icons',

		resolveId(source) {
			if (source === id) return '\0' + id;
		},

		async load(source) {
			if (source !== '\0' + id) return;
			const icons = await Promise.all(
				[...commonIcons].map(async (name) => {
					const svg = await readFile(join(root, 'icons', name), 'utf8');
					return [name, 'data:image/svg+xml,' + encodeURIComponent(svg)];
				}),
			);
			return `export const inlineIcons = ${JSON.stringify(Object.fromEntries(icons))}; export default ${JSON.stringify(manifest)};`;
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
