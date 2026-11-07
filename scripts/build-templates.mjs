import { build } from 'esbuild';
for (const name of ['fullstack', 'project-inspection']) {
	await build({
		entryPoints: [`templates/${name}/src/index.mjs`],
		outfile: `templates/${name}/backend/index.mjs`,
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node26',
	});
}
