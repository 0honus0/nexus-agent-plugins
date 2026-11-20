import { ref } from 'vue';
import type { Terminal } from '@xterm/xterm';
type Point = { x: number; y: number };

/** Uses public xterm buffer cells, including wide characters; never reaches into renderer internals. */
export function createTerminalSelection(
	getTerminal: () => Terminal | undefined,
	getFrame: () => HTMLElement | undefined,
) {
	const handles = ref<{ start?: Point; end?: Point }>({});
	let base: { start: number; end: number } | undefined;

	function cell(point: Point) {
		const t = getTerminal(),
			screen = t?.element?.querySelector('.xterm-screen');
		if (!t || !screen) return;
		const rect = screen.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		const row =
			t.buffer.active.viewportY +
			Math.max(0, Math.min(t.rows - 1, Math.floor(((point.y - rect.top) * t.rows) / rect.height)));
		let col = Math.max(0, Math.min(t.cols - 1, Math.floor(((point.x - rect.left) * t.cols) / rect.width)));
		const line = t.buffer.active.getLine(row);
		while (col > 0 && line?.getCell(col)?.getWidth() === 0) col--;
		return { row, col, width: line?.getCell(col)?.getWidth() || 1 };
	}

	function capture() {
		const t = getTerminal(),
			range = t?.getSelectionPosition();
		base =
			t && range
				? { start: range.start.y * t.cols + range.start.x, end: range.end.y * t.cols + range.end.x }
				: undefined;
	}

	function sync() {
		const t = getTerminal(),
			range = t?.getSelectionPosition(),
			frame = getFrame();
		const screen = t?.element?.querySelector('.xterm-screen');
		if (!t || !range || !frame || !screen || !base) {
			handles.value = {};
			return;
		}
		const outer = frame.getBoundingClientRect(),
			rect = screen.getBoundingClientRect();

		const position = (x: number, y: number) => {
			const row = y - t.buffer.active.viewportY;
			return row < 0 || row >= t.rows
				? undefined
				: {
						x: Math.max(12, Math.min(outer.width - 12, rect.left - outer.left + (x * rect.width) / t.cols)),
						y: Math.max(
							12,
							Math.min(outer.height - 16, rect.top - outer.top + ((row + 1) * rect.height) / t.rows),
						),
					};
		};

		handles.value = {
			start: position(range.start.x, range.start.y),
			end: position(range.end.x, range.end.y),
		};
	}

	function word(point: Point) {
		const t = getTerminal(),
			c = cell(point);
		if (!t || !c) return;
		const line = t.buffer.active.getLine(c.row);

		const text = (col: number) => {
			const value = line?.getCell(col);
			return value?.getWidth() === 0 || /\S/u.test(value?.getChars() ?? '');
		};

		if (!text(c.col)) t.selectLines(c.row, c.row);
		else {
			let start = c.col,
				end = c.col + c.width;
			while (start > 0 && text(start - 1)) start--;
			while (end < t.cols && text(end)) end++;
			t.select(start, c.row, end - start);
		}
		capture();
		sync();
	}

	function extend(point: Point, anchor?: number) {
		const t = getTerminal(),
			c = cell(point);
		if (!t || !c || !base) return;
		const target = c.row * t.cols + c.col;
		const start = Math.min(anchor ?? base.start, target);
		const end = Math.max(anchor ?? base.end, target + c.width);
		t.select(start % t.cols, Math.floor(start / t.cols), Math.max(1, end - start));
		sync();
	}

	return {
		handles,
		word,
		extend,
		capture,
		sync,

		anchor(handle: 'start' | 'end') {
			capture();
			return handle === 'start' ? base?.end : base?.start;
		},

		all() {
			getTerminal()?.selectAll();
			capture();
			sync();
		},

		clear() {
			base = undefined;
			handles.value = {};
			getTerminal()?.clearSelection();
		},
	};
}
