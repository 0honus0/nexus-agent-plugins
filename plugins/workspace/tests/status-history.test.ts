import { expect, it } from 'vitest';
import { appendStatusHistory, emptyStatusHistory } from '../src/browser/status/status-history';
import {
	formatStatusPercent,
	formatStatusMemoryPair,
	formatStatusSwapPair,
	formatStatusDiskPair,
	formatStatusRateAxis,
} from '../src/browser/status/status-formatting';

it('keeps missing metrics and interrupted samples as gaps, rather than invented zeros', () => {
	let history = appendStatusHistory(emptyStatusHistory(), { timestamp: 1000, cpuPercent: 10, memPercent: 25 }, 1);
	history = appendStatusHistory(history, { timestamp: 4000, cpuPercent: 15 }, 2);
	history = appendStatusHistory(history, { timestamp: 7000, cpuPercent: 20, memPercent: 30 }, 4);
	expect(history.cpu.map((p) => p.sequence)).toEqual([1, 2, 4]);
	expect(history.memory.map((p) => p.sequence)).toEqual([1, 4]);
	expect(history.swap).toEqual([]);
});
it('retains at most thirty minutes without mutating previous history snapshots', () => {
	const previous = appendStatusHistory(emptyStatusHistory(), { timestamp: 1000, cpuPercent: 10 }, 1);
	const next = appendStatusHistory(previous, { timestamp: 1_801_001, cpuPercent: 20 }, 2);
	expect(previous.cpu).toHaveLength(1);
	expect(next.cpu.map((p) => p.value)).toEqual([20]);
});
it('preserves legacy capacity, precision and binary axis units', () => {
	expect(formatStatusPercent(4.2)).toBe('4.2%');
	expect(formatStatusPercent(120)).toBe('100.0%');
	expect(formatStatusPercent(NaN)).toBeNull();
	expect(formatStatusMemoryPair(2048, 8192)).toBe('2.0 / 8.0 GB');
	expect(formatStatusMemoryPair(256, 512)).toBe('256 / 512 MB');
	expect(formatStatusSwapPair(0, 0)).toBe('0 / 0 GB');
	expect(formatStatusDiskPair(40 * 1024 ** 2, 100 * 1024 ** 2)).toBe('40.0 / 100.0 GB');
	expect(formatStatusRateAxis(5 * 1024 ** 2, 1024 ** 2)).toBe('5M');
});
