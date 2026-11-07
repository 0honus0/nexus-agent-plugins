/** Finite provider failures; Host retains accepted effects and transport cleanup ownership. */
export class ServiceFailure extends Error {
	constructor(code, options) {
		super(`Service: ${code}`, options);
		this.name = 'ServiceFailure';
		this.code = code;
	}
}

export function record(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new ServiceFailure('invalid_input');
	}
	return value;
}

export function encoded(value, maxBytes = Number.MAX_SAFE_INTEGER) {
	const text = JSON.stringify(value);
	if (text === undefined || Buffer.byteLength(text, 'utf8') > maxBytes) {
		throw new ServiceFailure('limit_exceeded');
	}
	return text;
}

export function objectJson(value) {
	try {
		return record(JSON.parse(value));
	} catch (cause) {
		throw new ServiceFailure('invalid_input', { cause });
	}
}

export function text(value, maxBytes = Number.MAX_SAFE_INTEGER, allowEmpty = false) {
	if (
		typeof value !== 'string' ||
		(!allowEmpty && !value.trim()) ||
		value.includes('\0') ||
		!value.isWellFormed() ||
		Buffer.byteLength(value, 'utf8') > maxBytes
	) {
		throw new ServiceFailure('invalid_input');
	}
	return value;
}

export function collectFailures(results, primary, label) {
	const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
	if (failures.length) {
		throw new AggregateError(primary === null ? failures : [primary, ...failures], label);
	}
}
