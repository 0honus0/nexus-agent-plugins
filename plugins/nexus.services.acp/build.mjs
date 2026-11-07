import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServiceBackend } from '../../lib/services/build.mjs';

await buildServiceBackend(path.dirname(fileURLToPath(import.meta.url)));
