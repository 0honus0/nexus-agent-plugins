import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeAcpProtocol } from '../../src/protocol.mjs';
import { ManagedAcpStdio } from '../../src/stdio.mjs';
import { AGENT_PLUGIN_MAX_MESSAGE_BYTES } from '@nexus-terminal/shared/agent/plugins/values';

await test(
	'ACP SDK accepts large frames and many permission options without private field quotas',
	{ timeout: 10000 },
	async () => {
		const queue = [],
			waiting = [];
		let ended = false,
			promptId = null,
			approvals = 0,
			delivered = 0;
		const output = '😀'.repeat(100000);
		const title = 'A'.repeat(1024),
			rawInput = { text: 'x'.repeat(64000) };

		const send = (message) => {
			const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
			const next = waiting.shift();
			if (next) {
				next({ bytes, eof: false });
			} else {
				queue.push({ bytes, eof: false });
			}
		};

		const io = {
			async read() {
				if (queue.length) {
					return queue.shift();
				}
				if (ended) {
					return { bytes: new Uint8Array(), eof: true };
				}
				return new Promise((resolve) => waiting.push(resolve));
			},

			async write(bytes, grant) {
				const message = JSON.parse(Buffer.from(bytes).toString());
				if (message.method === 'initialize') {
					send({ id: message.id, result: { protocolVersion: 1 } });
				} else if (message.method === 'session/new') {
					send({ id: message.id, result: { sessionId: 'test-session' } });
				} else if (message.method === 'session/prompt') {
					assert.equal(message.params.prompt[0].text.length, 320000);
					promptId = message.id;
					send({
						id: 'permission',
						method: 'session/request_permission',
						params: {
							sessionId: 'test-session',
							toolCall: { toolCallId: 'tool', title, kind: 'edit', rawInput },
							options: Array.from({ length: 24 }, (_, index) => ({
								optionId: String(index),
								name: 'Choice ' + index,
								kind: index === 23 ? 'allow_once' : 'reject_once',
							})),
						},
					});
				} else if (message.id === 'permission') {
					assert.equal(grant, 'delivery-grant');
					assert.deepEqual(message.result, { outcome: { outcome: 'selected', optionId: '23' } });
					delivered++;
					send({
						method: 'session/update',
						params: {
							sessionId: 'test-session',
							update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: output } },
						},
					});
					send({ id: promptId, result: { stopReason: 'end_turn' } });
					ended = true;
				} else {
					assert.fail(JSON.stringify(message));
				}
			},

			async permission(request) {
				approvals++;
				assert.equal(request.title, title);
				assert.deepEqual(JSON.parse(request.inputJson), rawInput);
				return { decision: 'allow_once', grant: 'delivery-grant' };
			},
		};
		try {
			const result = await executeAcpProtocol(
				io,
				{
					cwd: '/tmp',
					prompt: 'p'.repeat(320000),
					maxOutputBytes: Number.MAX_SAFE_INTEGER,
					client: { name: 'capacity', version: '1' },
				},
				new AbortController().signal,
			);
			assert.deepEqual(result, { text: output, stopReason: 'end_turn' });
			assert.equal(approvals, 1);
			assert.equal(delivered, 1);
		} finally {
			ended = true;
			for (const release of waiting) {
				release({ bytes: new Uint8Array(), eof: true });
			}
		}
	},
);

await test('ACP ordinary outbound frames split into ordered Host RPC writes; permission delivery remains atomic', async () => {
	const sent = [];
	const io = new ManagedAcpStdio(
		async (method, params) => {
			if (method === 'transport.stdio.read') {
				return { eof: true, bytesBase64: '' };
			}
			assert.equal(method, 'transport.stdio.write');
			assert.ok(Buffer.byteLength(JSON.stringify({ method, params })) < AGENT_PLUGIN_MAX_MESSAGE_BYTES);
			sent.push(params);
		},
		'channel',
		async () => {},
	);
	const bytes = Buffer.from('😀'.repeat(240000));
	try {
		await io.write(bytes, null);
		assert.ok(sent.length > 1);
		assert.deepEqual(Buffer.concat(sent.map((item) => Buffer.from(item.bytesBase64, 'base64'))), bytes);
		assert.ok(sent.every((item) => item.permissionGrant === null));
		const before = sent.length;
		const permission = Buffer.from('{"id":"request","result":{}}\n');
		await io.write(permission, 'once');
		assert.equal(sent.length, before + 1);
		assert.equal(sent.at(-1).permissionGrant, 'once');
	} finally {
		await io.close();
	}
});
