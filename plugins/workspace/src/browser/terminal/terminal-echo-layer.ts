import type { Terminal } from '@xterm/xterm';
import type { LocalEchoMode } from '../../shared/workspace-catalog-types';
import { createTerminalLocalEcho, terminalTextWidth } from './terminal-local-echo';

/** Visual prediction only: remote bytes always go to xterm unchanged, once, in order.
 * Keeping predictions outside its parser avoids rollback corruption with CJK/wrapping/ANSI.
 * This layer is intentionally neither selectable nor part of serialize/scrollback.
 */
export function createTerminalEchoLayer(terminal: Terminal, mode: () => LocalEchoMode) {
	const echo = createTerminalLocalEcho(mode);
	const decoder = new TextDecoder();
	const screen = terminal.element!.querySelector<HTMLElement>('.xterm-screen')!;
	const layer = document.createElement('span');
	layer.className = 'workspace-terminal-echo';
	layer.setAttribute('aria-hidden', 'true');
	screen.append(layer);
	let frame = 0,
		writes = 0,
		composing = false,
		skipInput = false,
		disposed = false,
		epoch = 0,
		restoration = 0;
	let expiry: ReturnType<typeof setTimeout> | undefined;

	function eligible() {
		const buffer = terminal.buffer.active;
		return (
			!composing &&
			buffer.type === 'normal' &&
			buffer.viewportY === buffer.baseY &&
			!terminal.modes.applicationCursorKeysMode &&
			!terminal.modes.applicationKeypadMode &&
			!terminal.modes.insertMode &&
			terminal.modes.mouseTrackingMode === 'none' &&
			!terminal.hasSelection() &&
			!buffer
				.getLine(buffer.baseY + buffer.cursorY)
				?.translateToString(true, buffer.cursorX)
				.trim()
		);
	}

	function hide() {
		layer.hidden = true;
		layer.replaceChildren();
		terminal.element?.classList.remove('workspace-terminal-echo-active');
	}

	function render() {
		frame = 0;
		if (disposed) return;
		const text = echo.text(),
			buffer = terminal.buffer.active;
		const width = terminalTextWidth(text);
		if (!text || writes || mode() === 'off' || !eligible() || buffer.cursorX + width >= terminal.cols) {
			hide();
			return;
		}
		const box = screen.getBoundingClientRect(),
			cellWidth = box.width / terminal.cols,
			cellHeight = box.height / terminal.rows;
		Object.assign(layer.style, {
			left: `${buffer.cursorX * cellWidth}px`,
			top: `${buffer.cursorY * cellHeight}px`,
			fontFamily: terminal.options.fontFamily,
			fontSize: `${terminal.options.fontSize}px`,
			fontWeight: String(terminal.options.fontWeight),
			lineHeight: `${cellHeight}px`,
			height: `${cellHeight}px`,
			color: terminal.options.theme?.foreground ?? '#ffffff',
		});
		layer.replaceChildren();
		for (const char of text) {
			const span = document.createElement('span');
			span.textContent = char;
			span.style.width = `${terminalTextWidth(char) * cellWidth}px`;
			layer.append(span);
		}
		const cursor = document.createElement('span');
		cursor.style.width = `${cellWidth}px`;
		cursor.style.background = terminal.options.theme?.cursor ?? terminal.options.theme?.foreground ?? '#ffffff';
		layer.append(cursor);
		layer.hidden = false;
		terminal.element!.classList.add('workspace-terminal-echo-active');
	}

	function schedule() {
		if (!disposed && !frame) frame = requestAnimationFrame(render);
	}

	function reset() {
		epoch++;
		echo.reset();
		decoder.decode();
		clearTimeout(expiry);
		hide();
	}

	function ignoreInput() {
		reset();
		skipInput = true;
	}

	function compositionStart() {
		composing = true;
		reset();
	}

	function compositionEnd() {
		composing = false;
	}

	const element = terminal.element!;
	element.addEventListener('paste', ignoreInput, true);
	element.addEventListener('compositionstart', compositionStart, true);
	element.addEventListener('compositionend', compositionEnd, true);
	const subscriptions = [terminal.onRender(schedule), terminal.onScroll(reset), terminal.onSelectionChange(reset)];
	hide();
	return {
		reset,
		ignoreInput,

		snapshot(data: string, cols: number, rows: number, onReady: () => void) {
			const generation = ++restoration;
			reset();
			terminal.resize(cols, rows);
			writes++;
			// RIS resets in parser order. terminal.reset() would leave queued old output
			// to paint after the reset and duplicate parts of the restored snapshot.
			terminal.write('\x1bc' + data, () => {
				writes--;
				if (disposed || generation !== restoration) return;
				onReady();
				schedule();
			});
		},

		input(data: string, predict: boolean) {
			echo.input(data, predict && !skipInput && !writes && eligible());
			skipInput = false;
			clearTimeout(expiry);
			expiry = setTimeout(reset, 2000);
			schedule();
		},

		write(data: Uint8Array) {
			// Decode in the caller's frame order, never asynchronously through Blob.text().
			const generation = epoch;
			writes++;
			hide();
			const text = decoder.decode(data, { stream: true });
			terminal.write(data, () => {
				writes--;
				if (disposed) return;
				if (generation === epoch) echo.output(text);
				schedule();
			});
		},

		dispose() {
			disposed = true;
			reset();
			cancelAnimationFrame(frame);
			subscriptions.forEach((item) => item.dispose());
			element.removeEventListener('paste', ignoreInput, true);
			element.removeEventListener('compositionstart', compositionStart, true);
			element.removeEventListener('compositionend', compositionEnd, true);
			layer.remove();
		},
	};
}
