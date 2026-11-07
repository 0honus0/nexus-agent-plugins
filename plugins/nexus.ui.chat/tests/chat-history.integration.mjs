import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = await mkdtemp(join(tmpdir(), 'nexus-chat-history-'));
after(() => rm(output, { recursive: true, force: true }));
const entry = resolve(root, 'tests/history-entry.ts');
await build({
	configFile: false,
	root,
	logLevel: 'error',
	resolve: { alias: { '@': resolve(root, 'src') } },
	plugins: [
		{
			name: 'chat-history-test-entry',
			resolveId(source) {
				if (source === entry) return '\0' + entry;
			},
			load(id) {
				if (id !== '\0' + entry) return;
				return [
					'export { ref } from "vue";',
					'export * from "@/features/agent/model/native-run-rules";',
					'export { useNativeTranscript } from "@/features/agent/composables/use-native-transcript";',
				].join('\n');
			},
		},
	],
	build: {
		outDir: output,
		emptyOutDir: true,
		minify: false,
		lib: { entry, formats: ['es'], fileName: () => 'history.mjs' },
	},
});

test('Agent transcript keeps row and image identity during text deltas and rejects malformed pages atomically', async () => {
	const result = await (async () => {
		const client = await import(pathToFileURL(join(output, 'history.mjs')).href);
		const cursor = { runSequence: 1, messageOrdinal: 1, chunkIndex: 1, textOffset: 3 };
		const entries = client.ref([
			{ runId: 'run', operationSequence: 1, role: 'assistant', position: cursor, text: 'gif' },
		]);
		const tools = client.ref([]);
		const view = client.useNativeTranscript(entries, tools);
		const row = view.transcriptRows.value[0];
		const message = entries.value[0];
		const next = {
			runId: 'run',
			operationSequence: 1,
			role: 'assistant',
			position: { ...cursor, chunkIndex: 2 },
			text: ' ![image](gif.gif)',
		};
		client.validateNativeConversationPage(cursor, [next]);
		client.applyNativeConversationEntries(entries.value, [next]);
		let rejected = false;
		try {
			client.validateNativeConversationPage(next.position, [next]);
		} catch {
			rejected = true;
		}
		return {
			rowStable: row === view.transcriptRows.value[0],
			messageStable: message === entries.value[0],
			text: entries.value[0].text,
			rejected,
			emptyStable: client.appendNativeConversationEntries(entries.value, []) === entries.value,
			toolsStable: client.mergeNativeTools(tools.value, []) === tools.value,
		};
	})();
	assert.deepEqual(result, {
		rowStable: true,
		messageStable: true,
		text: 'gif ![image](gif.gif)',
		rejected: true,
		emptyStable: true,
		toolsStable: true,
	});
});

test('Agent history releases only whole offscreen messages and restores the exact paging boundary', async () => {
	const result = await (async () => {
		const client = await import(pathToFileURL(join(output, 'history.mjs')).href);

		const make = (step) => ({
			runId: 'run',
			operationSequence: step * 2 - 1,
			role: 'assistant',
			position: { runSequence: 1, messageOrdinal: step, chunkIndex: 1, textOffset: 2048 },
			text: String(step) + ':' + 'x'.repeat(2048),
		});

		const originals = Array.from({ length: 180 }, (_, index) => make(index + 1));
		const entries = client.ref(originals.slice());
		const tools = client.ref([{ id: 'old-tool', runId: 'run', sequence: 4, createdAt: 1 }]);
		const view = client.useNativeTranscript(entries, tools);
		const old = entries.value[1];
		const firstRows = view.transcriptRows.value;
		const untouched = client.releaseNativeConversationHistory(entries.value, 0);
		const boundary = client.releaseNativeConversationHistory(entries.value, 160);
		const first = entries.value[0];
		const pruned = view.transcriptRows.value;
		const noOrphan = pruned.every((row) => row.entry !== null);
		const retained = entries.value.slice();
		const restored = client.prependNativeConversationEntries(
			entries.value,
			originals.filter((item) => item.position.messageOrdinal < boundary.messageOrdinal),
		);
		entries.value = restored;
		const oldRow = view.transcriptRows.value.find((row) => row.entry?.position.messageOrdinal === 2);
		return {
			untouched,
			count: retained.length,
			boundary,
			firstStep: first.position.messageOrdinal,
			prefix: restored[0].text,
			restoredCount: restored.length,
			retainedIdentity: retained[1] === restored[originals.length - retained.length + 1],
			noOrphan,
			toolRestored: oldRow.tools[0].id === 'old-tool',
			initialTool: firstRows[1].tools.length === 1,
			oldText: old.text,
		};
	})();
	assert.equal(result.untouched, null);
	assert.ok(result.count < 180);
	assert.equal(result.boundary.textOffset, 0);
	assert.equal(result.boundary.messageOrdinal, result.firstStep);
	assert.equal(result.restoredCount, 180);
	assert.equal(result.prefix.startsWith('1:'), true);
	assert.equal(result.oldText.startsWith('2:'), true);
	assert.equal(result.retainedIdentity && result.noOrphan && result.toolRestored && result.initialTool, true);
});
