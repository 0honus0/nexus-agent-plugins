import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Framework-owned cleanup includes failed assertions and retains the original database. */
export async function openScenarioHost(t, candidate, label, options = {}) {
	const directory = join(candidate.artifactRoot, label);
	await mkdir(directory, { recursive: false });
	const timing = { setupMs: null, executeMs: null, drainMs: null };
	const started = performance.now();
	const host = await candidate.openAgentHost(directory, {
		packages: candidate.packages.filter(({ metadata }) =>
			['nexus.agent', 'nexus.tools.remote', 'nexus.tools.agent'].includes(metadata.packageId),
		),
		packageId: 'nexus.agent',
		selectedRootIds: ['nexus.tools.remote', 'nexus.tools.agent'],
		uiPackageId: null,
		protocol: 'chat-completions',
		...options,
	});
	timing.setupMs = performance.now() - started;
	const executing = performance.now();
	t.after(async () => {
		timing.executeMs = performance.now() - executing;
		const draining = performance.now();
		try {
			await host.close();
		} finally {
			timing.drainMs = performance.now() - draining;
			await writeFile(join(directory, 'timings.json'), JSON.stringify(timing, null, 2));
			t.diagnostic(JSON.stringify(timing));
		}
	});
	return { host, directory };
}
