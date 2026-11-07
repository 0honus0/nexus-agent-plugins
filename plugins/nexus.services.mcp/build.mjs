import { build as buildFrontend } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServiceBackend } from '../../lib/services/build.mjs';

await buildServiceBackend(path.dirname(fileURLToPath(import.meta.url)));

await buildFrontend({
	configFile: path.join(path.dirname(fileURLToPath(import.meta.url)), 'src/settings/vite.config.ts'),
});
