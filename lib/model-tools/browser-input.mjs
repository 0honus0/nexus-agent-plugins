import { AGENT_ARTIFACT_MAX_BYTES } from '@nexus-terminal/shared/agent/artifacts/values';
import { AGENT_BROWSER_MAX_SETTLE_MS } from '@nexus-terminal/shared/agent/integrations/browser-values';
import { AgentFailure } from './failure.mjs';
import { AGENT_ID_PATTERN } from '@nexus-terminal/shared/agent/values';

function text(value, empty = false) {
	if (typeof value !== 'string' || (!empty && !value)) {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function id(value) {
	const result = text(value);
	if (!AGENT_ID_PATTERN.test(result)) {
		throw new AgentFailure('invalid_input');
	}
	return result.toLowerCase();
}

function integer(value, defaultValue) {
	if (value === void 0) {
		return defaultValue;
	}
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		throw new AgentFailure('invalid_input');
	}
	return value;
}

function browserInput(name, value) {
	const action = name.slice('browser_'.length);
	if (action === 'open') {
		return { action: 'open', targetId: text(value.targetId), expectedVersion: integer(value.expectedVersion, 1) };
	}
	const sessionId = id(value.sessionId);
	if (action === 'close') {
		return { action: 'close', sessionId };
	}
	if (action === 'snapshot') {
		const include = [];
		if (value.include !== void 0) {
			if (!Array.isArray(value.include)) {
				throw new AgentFailure('invalid_input');
			}
			for (const item of value.include) {
				if ((item !== 'screenshot' && item !== 'console') || include.includes(item)) {
					throw new AgentFailure('invalid_input');
				}
				include.push(item);
			}
		}
		return {
			action: 'snapshot',
			sessionId,
			maxNodes: integer(value.maxNodes, 256),
			include,
			after: integer(value.after, 0),
			limit: integer(value.limit, 50),
		};
	}
	if (action === 'screenshot') {
		return { action: 'screenshot', sessionId };
	}
	if (action === 'console') {
		return { action: 'console', sessionId, after: integer(value.after, 0), limit: integer(value.limit, 50) };
	}
	const settleMs = integer(value.settleMs, 250);
	if (settleMs < 0 || settleMs > AGENT_BROWSER_MAX_SETTLE_MS) {
		throw new AgentFailure('invalid_input');
	}
	if (action === 'navigate') {
		return { action: 'navigate', sessionId, settleMs, url: text(value.url) };
	}
	if (action === 'back') {
		return { action: 'back', sessionId, settleMs };
	}
	if (action === 'scroll') {
		return {
			action: 'scroll',
			sessionId,
			settleMs,
			deltaX: integer(value.deltaX, 0),
			deltaY: integer(value.deltaY, 0),
		};
	}
	if (action === 'wait') {
		if (value.mode !== 'timeout' && value.mode !== 'networkIdle') {
			throw new AgentFailure('invalid_input');
		}
		return { action: 'wait', sessionId, mode: value.mode, maxMillis: integer(value.maxMillis, 1e3) };
	}
	if (action === 'press') {
		const key = text(value.key);
		if (
			!/^(?:[\x20-\x7e]|Enter|Tab|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space|Key[A-Z]|Digit[0-9]|F[1-9]|F1[0-2])$/u.test(
				key,
			)
		) {
			throw new AgentFailure('invalid_input');
		}
		if ((value.snapshotId === void 0) !== (value.nodeRef === void 0)) {
			throw new AgentFailure('invalid_input');
		}
		const modifiers = [];
		if (value.modifiers !== void 0) {
			if (!Array.isArray(value.modifiers) || value.modifiers.length > 4) {
				throw new AgentFailure('invalid_input');
			}
			for (const modifier of value.modifiers) {
				if (
					(modifier !== 'Alt' && modifier !== 'Control' && modifier !== 'Meta' && modifier !== 'Shift') ||
					modifiers.includes(modifier)
				) {
					throw new AgentFailure('invalid_input');
				}
				modifiers.push(modifier);
			}
		}
		let focus = null;
		if (value.snapshotId !== void 0) {
			const nodeRef2 = text(value.nodeRef);
			if (!/^[0-9]+$/u.test(nodeRef2)) {
				throw new AgentFailure('invalid_input');
			}
			focus = { snapshotId: id(value.snapshotId), nodeRef: nodeRef2 };
		}
		return { action: 'press', sessionId, settleMs, key, focus, modifiers };
	}
	const snapshotId = id(value.snapshotId),
		nodeRef = text(value.nodeRef);
	if (!/^[0-9]+$/u.test(nodeRef)) {
		throw new AgentFailure('invalid_input');
	}
	if (action === 'click') {
		return { action: 'click', sessionId, settleMs, snapshotId, nodeRef };
	}
	if (action === 'select') {
		if (
			!Array.isArray(value.values) ||
			value.values.length === 0 ||
			value.values.some((item) => typeof item !== 'string')
		) {
			throw new AgentFailure('invalid_input');
		}
		return {
			action: 'select',
			settleMs,
			sessionId,
			snapshotId,
			nodeRef,
			values: value.values.map((item) => text(item, true)),
		};
	}
	if (action === 'type') {
		return { action: 'type', sessionId, settleMs, snapshotId, nodeRef, text: text(value.text, true) };
	}
	if (action === 'upload') {
		const sha256 = text(value.sha256);
		if (!/^[a-f0-9]{64}$/u.test(sha256)) {
			throw new AgentFailure('invalid_input');
		}
		return {
			action: 'upload',
			settleMs,
			sessionId,
			snapshotId,
			nodeRef,
			artifactId: id(value.artifactId),
			expectedVersion: integer(value.expectedVersion, 1),
			sha256,
		};
	}
	if (action === 'download') {
		return {
			action: 'download',
			sessionId,
			snapshotId,
			nodeRef,
			maxBytes: integer(value.maxBytes, AGENT_ARTIFACT_MAX_BYTES),
		};
	}
	throw new AgentFailure('invalid_input');
}

export { browserInput };
