/** Read the complete currently authorized catalog before applying package-owned search. */
export async function readDiscoveryCatalog(call, signal) {
	const definitions = [];
	const names = new Set();
	let cursor = 0;
	let sha256 = null;
	for (;;) {
		signal.throwIfAborted();
		const page = await call({ operation: 'discovery.catalog', cursor, sha256 });
		signal.throwIfAborted();
		if (
			!/^[a-f0-9]{64}$/u.test(page.sha256) ||
			(sha256 !== null && page.sha256 !== sha256) ||
			(page.nextCursor !== null &&
				(!Number.isSafeInteger(page.nextCursor) ||
					page.nextCursor !== cursor + page.definitions.length ||
					page.nextCursor <= cursor))
		) {
			throw new Error('HOST_DISCOVERY_PAGE_MISMATCH');
		}
		for (const definition of page.definitions) {
			if (names.has(definition.name)) {
				throw new Error('HOST_DISCOVERY_PAGE_MISMATCH');
			}
			names.add(definition.name);
			definitions.push(definition);
		}
		if (page.nextCursor === null) {
			return definitions;
		}
		cursor = page.nextCursor;
		sha256 = page.sha256;
	}
}
