import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { resultPreview } from '../../src/result-preview.mjs';

await test('Model result preview retains exact UTF-8 hash, code-point cursor and encoded budget', () => {
	const original = JSON.stringify({
		jobId: randomUUID(),
		outputRead: { action: 'output', offset: 0 },
		stdout: '甲🙂\\\n"'.repeat(20000),
	});
	for (const budget of [1, 1024, 4096, 16384]) {
		const encoded = resultPreview('00000000-0000-4000-8000-000000000000', original, budget);
		const preview = JSON.parse(encoded);
		assert.ok(Buffer.byteLength(encoded) <= Math.max(1024, budget));
		assert.equal(preview.kind, 'captured_result_preview');
		assert.equal(preview.truncated, true);
		assert.equal(preview.projection.sha256, createHash('sha256').update(original).digest('hex'));
		assert.equal(preview.projection.originalBytes, Buffer.byteLength(original));
		assert.equal(preview.projection.text, Array.from(original).slice(0, preview.projection.nextOffset).join(''));
		assert.ok(preview.projection.text.includes('"outputRead":'));
		assert.ok(preview.projection.text.isWellFormed());
		assert.ok(preview.projection.nextOffset < Array.from(original).length);
	}
	assert.equal(resultPreview(randomUUID(), original, Buffer.byteLength(original)), original);
	assert.equal(
		resultPreview(null, original, 1024),
		original,
		'An unrecorded result cannot promise a receipt-based continuation',
	);
});
