import { compare, satisfies } from 'semver';

function matches(candidate, dependency, root) {
	return (
		candidate.manifest.id === dependency.packageId &&
		candidate.publisherKeyId === dependency.publisherKeyId &&
		satisfies(candidate.manifest.version, `>=${dependency.minVersion} <=${dependency.maxVersion}`, {
			includePrerelease: true,
		}) &&
		compare(candidate.manifest.compatibility.host.minVersion, root.compatibility.host.minVersion) <= 0 &&
		compare(candidate.manifest.compatibility.host.maxVersion, root.compatibility.host.maxVersion) >= 0
	);
}

function assertAcyclic(root, selected) {
	const visiting = new Set();
	const visited = new Set();
	const stack = [{ manifest: root, exit: false }];
	while (stack.length) {
		const { manifest, exit } = stack.pop();
		if (exit) {
			visiting.delete(manifest.id);
			visited.add(manifest.id);
			continue;
		}
		if (visiting.has(manifest.id)) {
			throw new Error(`PLUGIN_COMPOSITION_DEPENDENCY_CYCLE:${[...visiting, manifest.id].join(' -> ')}`);
		}
		if (visited.has(manifest.id)) {
			continue;
		}
		visiting.add(manifest.id);
		stack.push({ manifest, exit: true });
		for (const dependency of manifest.dependencies) {
			const provider = selected.get(dependency.packageId)?.manifest;
			if (provider) {
				stack.push({ manifest: provider, exit: false });
			}
		}
	}
}

/** Check code delivery only. Optional services/tools and the chosen UI are runtime composition facts. */
export function inspectComposition(manifest, candidates) {
	const app = manifest.contributions.app;
	if (app === null || manifest.backendEntry === null) {
		throw new Error(`PLUGIN_COMPOSITION_APP_REQUIRED:${manifest.id}`);
	}
	const pending = [new Map()];
	let missing = null;
	while (pending.length) {
		const selected = pending.pop();
		const requirements = new Map();
		for (const owner of [manifest, ...[...selected.values()].map((entry) => entry.manifest)]) {
			for (const dependency of owner.dependencies) {
				if (dependency.packageId === manifest.id) {
					throw new Error(`PLUGIN_COMPOSITION_ROOT_DEPENDENCY_INVALID:${owner.id}`);
				}
				const group = requirements.get(dependency.packageId) ?? [];
				group.push(dependency);
				requirements.set(dependency.packageId, group);
			}
		}
		if (
			[...selected].some(([id, candidate]) =>
				requirements.get(id)?.some((dependency) => !matches(candidate, dependency, manifest)),
			)
		) {
			continue;
		}
		const unresolved = [...requirements].find(([id]) => !selected.has(id));
		if (!unresolved) {
			assertAcyclic(manifest, selected);
			return {
				packageId: manifest.id,
				version: manifest.version,
				status: 'complete',
				selected: [...selected.values()].map(({ manifest: target }) => ({
					packageId: target.id,
					version: target.version,
				})),
				unselected: [],
				requiredUi: app.uiContract === null ? null : { contract: app.uiContract, apiVersion: app.uiApiVersion },
			};
		}
		const [id, constraints] = unresolved;
		const options = candidates
			.filter((candidate) => constraints.every((dependency) => matches(candidate, dependency, manifest)))
			.sort((left, right) => compare(left.manifest.version, right.manifest.version));
		if (!options.length) {
			missing ??= constraints.map((dependency) => ({
				packageId: id,
				publisherKeyId: dependency.publisherKeyId,
				minVersion: dependency.minVersion,
				maxVersion: dependency.maxVersion,
				status: 'unselected',
				reason: 'no-compatible-publisher-version-host',
			}));
		}
		for (const candidate of options) {
			const branch = new Map(selected);
			branch.set(id, candidate);
			pending.push(branch);
		}
	}
	if (!missing) {
		throw new Error(`PLUGIN_COMPOSITION_DEPENDENCY_CONFLICT:${manifest.id}`);
	}
	return {
		packageId: manifest.id,
		version: manifest.version,
		status: 'incomplete',
		selected: [],
		unselected: missing,
		requiredUi: app.uiContract === null ? null : { contract: app.uiContract, apiVersion: app.uiApiVersion },
	};
}
