export function listPage(names, nextAfter = null) {
	return {
		status: 'ok',
		value: {
			entries: names.map((name) => ({ name, kind: 'file', size: 1, modifiedAt: 0 })),
			nextAfter,
			fingerprint: 'a'.repeat(64),
		},
	};
}

export function textPage(input, text) {
	const bytes = Buffer.byteLength(text);
	return {
		status: 'ok',
		value: {
			path: input.path,
			text,
			bytes,
			sizeBytes: bytes,
			offset: 0,
			nextOffset: null,
			sha256: 'a'.repeat(64),
			pageSha256: 'a'.repeat(64),
			fingerprint: 'a'.repeat(64),
		},
	};
}
