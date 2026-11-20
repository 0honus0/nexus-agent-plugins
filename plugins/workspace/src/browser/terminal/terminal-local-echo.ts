import { eastAsianWidth } from 'get-east-asian-width';
import type { LocalEchoMode } from '../../shared/workspace-catalog-types';

// Predict common printable text only. Combining marks, emoji, controls and line wrapping
// fall back to xterm/remote echo; no private xterm Unicode API or cursor rollback is needed.
const printable =
	/^[\x20-\x7e\u3000\u3001-\u303f\u3041-\u3096\u30a0-\u30fa\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7a3\uff01-\uff60]+$/u;
const secretPrompt =
	/(?:password|passphrase|verification\s*code|one[- ]time|otp|token|密码|口令|验证码)[^\r\n]{0,120}[:：]\s*$/iu;

export function terminalTextWidth(text: string) {
	return [...text].reduce(
		(width, char) => width + eastAsianWidth(char.codePointAt(0)!, { ambiguousAsWide: false }),
		0,
	);
}

/** Tracks likely echoes without changing terminal output or storing input outside the session.
 * Even `on` first observes a real echo after Enter/control input. Password prompt detection is
 * a conservative heuristic, not knowledge of the remote PTY's ECHO flag.
 */
export function createTerminalLocalEcho(mode: () => LocalEchoMode, now = () => performance.now()) {
	let pending: { text: string; sentAt: number; predicted: boolean }[] = [];
	let observed = false,
		slowSamples = 0,
		secret = false,
		tail = '';

	function clear() {
		pending = [];
		observed = false;
	}

	function input(text: string, eligible = true) {
		if (
			!eligible ||
			mode() === 'off' ||
			secret ||
			!printable.test(text) ||
			/[\p{M}\p{Cf}]/u.test(text) ||
			text.length > 256 ||
			pending.reduce((size, item) => size + item.text.length, 0) + text.length > 256
		) {
			clear();
			return;
		}
		const predicted = observed && (mode() === 'on' || slowSamples >= 2) && pending.every((item) => item.predicted);
		pending.push({ text, sentAt: now(), predicted });
	}

	function output(text: string) {
		// Keep enough context for prompts split across WS frames. Controls invalidate predictions.
		tail = (tail + text)
			.split(/[\r\n]/)
			.at(-1)!
			.slice(-256);
		secret = secretPrompt.test(tail);
		if (secret) {
			clear();
			return;
		}
		for (const char of text) {
			const first = pending[0];
			if (!first || !first.text.startsWith(char)) {
				clear();
				return;
			}
			first.text = first.text.slice(char.length);
			if (!first.text) {
				pending.shift();
				observed = true;
				slowSamples = now() - first.sentAt >= 120 ? Math.min(2, slowSamples + 1) : 0;
			}
		}
	}

	return {
		input,
		output,

		text() {
			if (pending.some((item) => now() - item.sentAt > 2000)) clear();
			return pending.every((item) => item.predicted) ? pending.map((item) => item.text).join('') : '';
		},

		reset() {
			clear();
			slowSamples = 0;
			secret = false;
			tail = '';
		},
	};
}
