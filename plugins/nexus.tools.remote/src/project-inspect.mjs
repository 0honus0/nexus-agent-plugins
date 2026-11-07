import { record, readFiles, readInput } from './remote-files.mjs';

function batchItem(result, expectedPath) {
	if (!Array.isArray(result.items) || result.items.length !== 1) {
		throw new Error('REMOTE_RESULT_INVALID');
	}
	const item = record(result.items[0]);
	if (item.index !== 0 || item.path !== expectedPath || result.nextIndex !== null) {
		throw new Error('REMOTE_RESPONSE_MISMATCH');
	}
	if (item.failureCode === 'not_found' || item.failureCode === 'not_text') {
		return { failureCode: item.failureCode };
	}
	return { value: record(item.value) };
}

function manifestSummary(name, value) {
	const parsed = record(JSON.parse(value));
	if (name === 'package.json') {
		const scripts = parsed.scripts === undefined ? {} : record(parsed.scripts);
		const dependencies = parsed.dependencies === undefined ? {} : record(parsed.dependencies);
		const devDependencies = parsed.devDependencies === undefined ? {} : record(parsed.devDependencies);
		return {
			ecosystem: 'node',
			name: typeof parsed.name === 'string' ? parsed.name : null,
			packageManager: typeof parsed.packageManager === 'string' ? parsed.packageManager : null,
			scripts: Object.entries(scripts)
				.filter(([, command]) => typeof command === 'string')
				.map(([name]) => name),
			dependencies: Object.keys(dependencies),
			devDependencies: Object.keys(devDependencies),
		};
	}
	return {
		ecosystem: 'composer',
		name: typeof parsed.name === 'string' ? parsed.name : null,
		dependencies: Object.keys(parsed.require === undefined ? {} : record(parsed.require)),
	};
}

export async function inspectProject(args, request, signal) {
	const listing = batchItem(
		await readFiles(
			'file_list',
			readInput('file_list', { connectionId: args.connectionId, paths: [args.directory], after: args.after }),
			request,
			signal,
		),
		args.directory,
	);
	if (listing.failureCode) {
		return { directory: args.directory, failureCode: listing.failureCode };
	}
	if (!Array.isArray(listing.value.entries)) {
		throw new Error('REMOTE_RESULT_INVALID');
	}
	const entries = listing.value.entries.map((raw) => {
		const entry = record(raw);
		if (typeof entry.name !== 'string' || entry.name.includes('/') || typeof entry.kind !== 'string') {
			throw new Error('REMOTE_RESULT_INVALID');
		}
		return { name: entry.name, kind: entry.kind };
	});
	const names = new Set(entries.filter((entry) => entry.kind === 'file').map((entry) => entry.name));
	const manifests = [];
	for (const name of ['package.json', 'composer.json']) {
		if (!names.has(name)) {
			continue;
		}
		const manifestPath = `${args.directory === '/' ? '' : args.directory}/${name}`;
		const page = batchItem(
			await readFiles(
				'file_read',
				readInput('file_read', { connectionId: args.connectionId, paths: [manifestPath] }),
				request,
				signal,
			),
			manifestPath,
		);
		if (page.failureCode) {
			manifests.push({ file: name, failureCode: page.failureCode });
			continue;
		}
		if (typeof page.value.text !== 'string') {
			throw new Error('REMOTE_RESULT_INVALID');
		}
		if (page.value.nextOffset !== null) {
			manifests.push({ file: name, partial: true, nextOffset: page.value.nextOffset });
			continue;
		}
		let summary;
		try {
			summary = manifestSummary(name, page.value.text);
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			manifests.push({ file: name, invalidJson: true });
			continue;
		}
		manifests.push({ file: name, summary });
	}
	const ecosystems = [
		['python', ['pyproject.toml', 'requirements.txt', 'Pipfile']],
		['rust', ['Cargo.toml']],
		['go', ['go.mod']],
		['java', ['pom.xml', 'build.gradle', 'build.gradle.kts']],
		['dotnet', ['global.json', 'Directory.Build.props']],
	]
		.filter(([, markers]) => markers.some((marker) => names.has(marker)))
		.map(([ecosystem]) => ecosystem);
	return {
		directory: args.directory,
		fingerprint: listing.value.fingerprint,
		partialDirectory: listing.value.nextAfter !== null,
		nextAfter: listing.value.nextAfter,
		entries,
		ecosystems,
		manifests,
		recommendedChecks: manifests.flatMap((manifest) =>
			manifest.summary?.ecosystem === 'node'
				? manifest.summary.scripts
						.filter((name) => ['test', 'check', 'lint', 'build'].includes(name))
						.map((script) => ({ file: manifest.file, script }))
				: [],
		),
	};
}
