import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const output = process.argv[2];
if (!output) {
	throw new Error('Usage: node scripts/prepare-host-validation.mjs <artifacts-directory>');
}
const root = resolve(output);
await mkdir(root, { recursive: true });
const key = join(root, 'development-publisher.pem');
await writeFile(key, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }), {
	flag: 'wx',
	mode: 0o600,
});
execFileSync(process.execPath, [join(import.meta.dirname, 'build-staging.mjs'), root, key], {
	stdio: 'inherit',
});
