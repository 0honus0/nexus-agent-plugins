import type { ServerStatus } from '../../shared/workspace-status-types';

export interface StatusHistoryPoint {
	time: number;
	value: number;
	sequence: number;
}

export interface StatusHistory {
	cpu: StatusHistoryPoint[];
	memory: StatusHistoryPoint[];
	swap: StatusHistoryPoint[];
	disk: StatusHistoryPoint[];
	networkRx: StatusHistoryPoint[];
	networkTx: StatusHistoryPoint[];
}

export const historyMetrics = {
	cpu: 'cpuPercent',
	memory: 'memPercent',
	swap: 'swapPercent',
	disk: 'diskPercent',
	networkRx: 'netRxRate',
	networkTx: 'netTxRate',
} as const;

export function emptyStatusHistory(): StatusHistory {
	return { cpu: [], memory: [], swap: [], disk: [], networkRx: [], networkTx: [] };
}

/** Retain thirty minutes in the browser; missing readings do not become zero samples. */
export function appendStatusHistory(history: StatusHistory, sample: ServerStatus, sequence: number): StatusHistory {
	const result = emptyStatusHistory();
	for (const key of Object.keys(historyMetrics) as (keyof StatusHistory)[]) {
		const value = sample[historyMetrics[key]];
		const points = history[key].filter((point) => point.time > sample.timestamp - 30 * 60_000);
		if (value !== undefined && Number.isFinite(value)) points.push({ time: sample.timestamp, value, sequence });
		result[key] = points.slice(-1800);
	}
	return result;
}
