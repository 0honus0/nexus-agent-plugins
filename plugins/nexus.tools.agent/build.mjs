import { build as buildFrontend } from 'vite';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
await build({
	entryPoints: [path.join(root, 'src/index.mjs')],
	outfile: path.join(root, 'backend/index.mjs'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node26',
	legalComments: 'none',
});
console.log('Built independent agent tool algorithms and public SDK codecs.');

await buildFrontend({ configFile: path.join(root, 'src/settings/vite.config.ts') });
