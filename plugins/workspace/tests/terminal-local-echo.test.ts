import { describe, expect, it } from 'vitest';
import { createTerminalLocalEcho, terminalTextWidth } from '../src/browser/terminal/terminal-local-echo';
import type { LocalEchoMode } from '../src/shared/workspace-catalog-types';

function fixture(mode: LocalEchoMode = 'on') {
	let time = 0;
	const echo = createTerminalLocalEcho(
		() => mode,
		() => time,
	);
	return {
		echo,

		advance: (ms: number) => {
			time += ms;
		},
	};
}

describe('predictive echo', () => {
	it('requires a real echo, previews committed CJK and reconciles split outputs without changing them', () => {
		const { echo } = fixture();
		echo.input('a');
		expect(echo.text()).toBe('');
		echo.output('a');
		echo.input('中文');
		expect(echo.text()).toBe('中文');
		expect(terminalTextWidth('a中文')).toBe(5);
		echo.output('中');
		expect(echo.text()).toBe('文');
		echo.output('文');
		expect(echo.text()).toBe('');
	});

	it('automatically enables after two slow echoes and stops again on a fast connection', () => {
		const { echo, advance } = fixture('auto');
		for (const char of ['a', 'b']) {
			echo.input(char);
			expect(echo.text()).toBe('');
			advance(150);
			echo.output(char);
		}
		echo.input('c');
		expect(echo.text()).toBe('c');
		echo.output('c');
		echo.input('d');
		expect(echo.text()).toBe('');
	});

	it('does not draw newer predictions ahead of input still awaiting its first remote echo', () => {
		const { echo } = fixture();
		echo.input('a');
		echo.input('b');
		echo.output('a');
		echo.input('c');
		expect(echo.text()).toBe('');
		echo.output('bc');
		echo.input('d');
		expect(echo.text()).toBe('d');
	});

	it.each(['\r', '\x7f', '\x1b[A', 'line\nline', 'e\u0301', '😀', '\u302a'])(
		'falls back for unsafe input %j',
		(input) => {
			const { echo } = fixture();
			echo.input('a');
			echo.output('a');
			echo.input('pending');
			expect(echo.text()).toBe('pending');
			echo.input(input);
			expect(echo.text()).toBe('');
			echo.input('b');
			expect(echo.text()).toBe('');
		},
	);

	it('clears predictions for mismatched output, paste, reset and timeout', () => {
		const { echo, advance } = fixture();
		for (const reset of [
			() => echo.output('\x1b[2Kother'),
			() => echo.input('paste', false),
			() => echo.reset(),
			() => advance(2001),
		]) {
			echo.input('a');
			echo.output('a');
			echo.input('b');
			expect(echo.text()).toBe('b');
			reset();
			expect(echo.text()).toBe('');
		}
	});

	it('never predicts off and suppresses split password/Chinese prompts until actual echoes resume', () => {
		const off = fixture('off').echo;
		off.input('a');
		off.output('a');
		off.input('b');
		expect(off.text()).toBe('');
		const { echo } = fixture();
		echo.input('a');
		echo.output('a');
		echo.input('b');
		echo.output('\r\nPass');
		echo.output('word: ');
		echo.input('secret');
		expect(echo.text()).toBe('');
		echo.output('\r\n密码：');
		echo.input('中文密码');
		expect(echo.text()).toBe('');
		echo.output('\r\n$ ');
		echo.input('a');
		echo.output('a');
		echo.input('b');
		expect(echo.text()).toBe('b');
	});
});
