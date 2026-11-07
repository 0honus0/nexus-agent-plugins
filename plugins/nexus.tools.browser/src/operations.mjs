import { AgentFailure } from '../../../lib/model-tools/failure.mjs';

function artifact(value) {
	return {
		artifactId: value.artifactId,
		version: value.version,
		sha256: value.sha256,
		sizeBytes: value.sizeBytes,
		mediaType: value.mediaType,
	};
}

function page(value) {
	return { kind: 'page', url: value.url, title: value.title };
}

function consolePage(value) {
	return {
		entries: value.entries.map((entry) => ({ sequence: entry.sequence, type: entry.type, text: entry.text })),
		nextCursor: value.nextCursor,
		truncated: value.truncated,
	};
}

async function snapshot(input, call, signal) {
	const startedAt = Date.now();
	const value = await call({ operation: 'browser.snapshot', sessionId: input.sessionId, maxNodes: input.maxNodes });
	const snapshotAt = Date.now();
	signal.throwIfAborted();
	let screenshot = null;
	if (input.include.includes('screenshot')) {
		const capture = await call({ operation: 'browser.screenshot', sessionId: input.sessionId });
		signal.throwIfAborted();
		screenshot = { capturedAt: Date.now(), artifact: artifact(capture) };
	}
	let console = null;
	if (input.include.includes('console')) {
		const entries = await call({
			operation: 'browser.console',
			sessionId: input.sessionId,
			after: input.after,
			limit: input.limit,
		});
		signal.throwIfAborted();
		console = { capturedAt: Date.now(), entries: consolePage(entries) };
	}
	return {
		snapshotId: value.snapshotId,
		url: value.url,
		title: value.title,
		nodes: value.nodes.map((node) => ({
			ref: node.ref,
			parentRef: node.parentRef,
			tag: node.tag,
			text: node.text,
			attributes: node.attributes.map((attribute) => ({ name: attribute.name, value: attribute.value })),
		})),
		truncated: value.truncated,
		startedAt,
		snapshotAt,
		screenshot,
		console,
	};
}

/** Model names stop at this package; each branch calls one fixed domain operation. */
export async function executeBrowser(name, decoded, call, signal) {
	signal.throwIfAborted();
	if (name === 'browser_targets_list' && decoded.kind === 'browser_targets') {
		const value = await call({ operation: 'browser.catalog' });
		return {
			targets: value.targets.map((target) => ({
				targetId: target.targetId,
				expectedVersion: target.expectedVersion,
				allowedUrlPatterns: target.allowedUrlPatterns.map((pattern) => pattern),
			})),
			untrusted: true,
		};
	}
	if (decoded.kind !== 'browser' || name !== 'browser_' + decoded.input.action) {
		throw new AgentFailure('invalid_input');
	}
	const input = decoded.input;
	switch (input.action) {
		case 'open': {
			const value = await call({
				operation: 'browser.open',
				targetId: input.targetId,
				expectedVersion: input.expectedVersion,
			});
			return {
				sessionId: value.sessionId,
				targetId: value.targetId,
				targetVersion: value.targetVersion,
				runId: value.runId,
				createdAt: value.createdAt,
			};
		}
		case 'close': {
			const value = await call({ operation: 'browser.close', sessionId: input.sessionId });
			return { status: value.status };
		}
		case 'snapshot':
			return snapshot(input, call, signal);
		case 'screenshot':
			return artifact(await call({ operation: 'browser.screenshot', sessionId: input.sessionId }));
		case 'console':
			return consolePage(
				await call({
					operation: 'browser.console',
					sessionId: input.sessionId,
					after: input.after,
					limit: input.limit,
				}),
			);
		case 'navigate':
			return page(
				await call({
					operation: 'browser.navigate',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					url: input.url,
				}),
			);
		case 'back':
			return page(
				await call({ operation: 'browser.back', sessionId: input.sessionId, settleMs: input.settleMs }),
			);
		case 'scroll':
			return page(
				await call({
					operation: 'browser.scroll',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					deltaX: input.deltaX,
					deltaY: input.deltaY,
				}),
			);
		case 'press':
			return page(
				await call({
					operation: 'browser.press',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					key: input.key,
					modifiers: input.modifiers.map((modifier) => modifier),
					focus:
						input.focus === null
							? null
							: { snapshotId: input.focus.snapshotId, nodeRef: input.focus.nodeRef },
				}),
			);
		case 'select':
			return page(
				await call({
					operation: 'browser.select',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					snapshotId: input.snapshotId,
					nodeRef: input.nodeRef,
					values: input.values.map((value) => value),
				}),
			);
		case 'wait':
			return page(
				await call({
					operation: 'browser.wait',
					sessionId: input.sessionId,
					mode: input.mode,
					maxMillis: input.maxMillis,
				}),
			);
		case 'click':
			return page(
				await call({
					operation: 'browser.click',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					snapshotId: input.snapshotId,
					nodeRef: input.nodeRef,
				}),
			);
		case 'type':
			return page(
				await call({
					operation: 'browser.type',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					snapshotId: input.snapshotId,
					nodeRef: input.nodeRef,
					text: input.text,
				}),
			);
		case 'upload':
			return page(
				await call({
					operation: 'browser.upload',
					sessionId: input.sessionId,
					settleMs: input.settleMs,
					snapshotId: input.snapshotId,
					nodeRef: input.nodeRef,
					artifactId: input.artifactId,
					expectedVersion: input.expectedVersion,
					sha256: input.sha256,
				}),
			);
		case 'download':
			return artifact(
				await call({
					operation: 'browser.download',
					sessionId: input.sessionId,
					snapshotId: input.snapshotId,
					nodeRef: input.nodeRef,
					maxBytes: input.maxBytes,
				}),
			);
		default:
			throw new AgentFailure('invalid_input');
	}
}
