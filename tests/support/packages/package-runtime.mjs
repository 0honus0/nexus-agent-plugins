import assert from 'node:assert/strict';
import { PluginCapabilityFailure } from '../../../sdk/backend-v4.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Exercises the distributed SDK and compiled package, with only privileged Host I/O substituted. */
export async function openPackageRuntime(packageId, perform) {
	const base = new URL(`../../../plugins/${packageId}/`, import.meta.url);
	const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
	const { default: runtime } = await import(new URL(manifest.backendEntry + '?test=' + randomUUID(), base));
	const appId = randomUUID();
	const runId = randomUUID();
	const registrations = await runtime.activate({
		context: {
			protocol: 4,
			sdkVersion: '4',
			appId,
			instanceId: randomUUID(),
			generation: randomUUID(),
			package: {
				packageId,
				version: manifest.version,
				packageHash: 'a'.repeat(64),
				publisherKeyId: 'ed25519:' + 'b'.repeat(64),
			},
			configurationRevision: 0,
		},
	});
	const drafts = new Map();
	const bridge = {
		async call(input) {
			const args = JSON.parse(input.inputJson);
			let value;
			if (input.method === 'host.perform') {
				const result = await perform(args.request, args.operationKey);
				if (result?.failure) {
					return { ok: false, code: result.failure };
				}
				value = { operation: args.request.operation, value: result };
			} else if (input.method === 'content.open') {
				const id = randomUUID();
				if (!drafts.has(id)) {
					drafts.set(id, { parts: [], mediaType: args.mediaType });
				}
				const draft = drafts.get(id);
				value = { id, chunks: draft.parts.length, sealed: false };
			} else if (input.method === 'content.append') {
				const draft = drafts.get(args.id);
				assert.ok(draft);
				assert.equal(args.index, draft.parts.length);
				draft.parts.push(args.text);
				value = { id: args.id, chunks: draft.parts.length, sealed: false };
			} else if (input.method === 'content.seal') {
				const draft = drafts.get(args.id);
				assert.equal(args.chunks, draft.parts.length);
				const text = draft.parts.join('');
				const sha256 = createHash('sha256').update(text).digest('hex');
				assert.equal(args.sha256, sha256);
				value = { id: args.id, sha256, sizeBytes: Buffer.byteLength(text), mediaType: draft.mediaType };
			} else {
				throw new Error('Unexpected capability: ' + input.method);
			}
			return { ok: true, valueJson: JSON.stringify(value) };
		},
	};
	return {
		runtime,
		registrations,

		async invoke(name, args, signal = new AbortController().signal) {
			const key = name.startsWith(packageId + '.') ? name : packageId + '.' + name;
			assert.ok(registrations.some((entry) => entry.key === key));
			const reply = await runtime.dispatch(
				{
					key,
					argumentsJson: JSON.stringify(args),
					scope: { kind: 'run', runId, operationId: randomUUID(), deadlineUnixMs: Date.now() + 60000 },
				},
				bridge,
				signal,
			);
			if ('errorCode' in reply) {
				throw new PluginCapabilityFailure(reply.errorCode);
			}
			const result = JSON.parse(reply.resultJson);
			assert.ok(drafts.has(result.content.id));
			return JSON.parse(drafts.get(result.content.id).parts.join(''));
		},

		async close() {
			await runtime.dispose();
		},
	};
}
