import { execFileSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));

// 市场只解包。将 ssh2 的 JS/WASM 路径随插件交付，Node 内置模块由宿主解析。
await build({
	configFile: false,
	publicDir: false,
	build: {
		ssr: true,
		target: 'node26',
		license: { fileName: 'third-party-licenses.md' },
		outDir: path('../dist/node'),
		emptyOutDir: true,
		rolldownOptions: {
			input: { index: path('../src/node/index.ts') },

			external: (id) =>
				isBuiltin(id) || id === 'nexus-terminal/node' || id === 'cpu-features' || id.endsWith('sshcrypto.node'),

			output: {
				entryFileNames: '[name].js',
				banner: 'const __dirname = import.meta.dirname;',
			},
		},
	},
	ssr: { noExternal: true },
});

const require = createRequire(import.meta.url);
await mkdir(path('../dist/util'), { recursive: true });
await cp(require.resolve('ssh2/util/pagent.exe'), path('../dist/util/pagent.exe'));

execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], {
	cwd: path('../'),
	stdio: 'inherit',
});
