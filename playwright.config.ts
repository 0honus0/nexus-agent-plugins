import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCandidateHost } from './tests/interoperability/support/candidate-host.mjs';

const candidate = await loadCandidateHost();
await writeFile(
	join(candidate.artifactRoot, 'browser-combination.json'),
	JSON.stringify(candidate.combination, null, 2),
);
const hostRoot = process.env.NEXUS_TEST_HOST_ROOT;
if (!hostRoot) throw new Error('NEXUS_TEST_HOST_ROOT is required');
const { createPluginBrowserConfig } = await import(
	pathToFileURL(join(resolve(hostRoot), 'tests/support/plugins/browser-config.ts')).href
);

export default await createPluginBrowserConfig(import.meta.dirname);
