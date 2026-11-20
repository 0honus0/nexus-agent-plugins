<script setup lang="ts">
	import { computed, defineAsyncComponent, ref, nextTick, type Component } from 'vue';
	import {
		Cpu as CpuIcon,
		MemoryStick as MemoryIcon,
		ArrowDownUp as SwapIcon,
		HardDrive as DiskIcon,
		Activity,
		ArrowDown,
		ArrowUp,
		X,
		LoaderCircle,
	} from '@lucide/vue';
	import type { PluginContextApi } from 'nexus-terminal/browser';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import { usePanePresentation } from '../presentation/pane-presentation';
	import { statusPresentation } from './status-presentation';
	import { useServerStatus } from './use-server-status';
	import StatusChartLoading from './StatusChartLoading.vue';
	import {
		formatStatusDiskPair,
		formatStatusMemoryPair,
		formatStatusPercent,
		formatStatusRate,
		formatStatusSwapPair,
	} from './status-formatting';

	const StatusCharts = defineAsyncComponent({
		loader: () => import('./StatusTrend.vue'),

		loadingComponent: StatusChartLoading,
		delay: 120,
	});

	type ResourceMetric = 'cpu' | 'memory' | 'swap' | 'disk';
	type StatusMetric = ResourceMetric | 'network';

	const props = withDefaults(
		defineProps<{
			ctx: PluginContextApi;
			sessionId: string;
			enabled: boolean;
			connected?: boolean;
			host?: string;
			i18n: WorkspaceI18n;
		}>(),
		{ connected: true },
	);
	const { t } = props.i18n;
	const state = useServerStatus(props);
	// The current remote-tools contract uses bytes; the legacy presentation uses MiB/KiB.
	const monitor = {
		...state,
		current: computed(() => {
			const sample = state.current.value;
			if (!sample) return undefined;
			return {
				...sample,
				memUsed: sample.memUsed === undefined ? undefined : sample.memUsed / 1024 ** 2,
				memTotal: sample.memTotal === undefined ? undefined : sample.memTotal / 1024 ** 2,
				swapUsed: sample.swapUsed === undefined ? undefined : sample.swapUsed / 1024 ** 2,
				swapTotal: sample.swapTotal === undefined ? undefined : sample.swapTotal / 1024 ** 2,
				diskUsed: sample.diskUsed === undefined ? undefined : sample.diskUsed / 1024,
				diskTotal: sample.diskTotal === undefined ? undefined : sample.diskTotal / 1024,
			};
		}),
	};
	const scaleRoot = ref<HTMLElement>();
	const { scale: localScale, style: scaleStyle } = usePanePresentation(scaleRoot, statusPresentation);
	const selectedMetric = ref<StatusMetric | null>(null);
	const historyRange = ref<1 | 5 | 10 | 30>(5);
	const ranges = [1, 5, 10, 30] as const;
	const hasVisibleData = computed(() => Boolean(monitor.current.value && !monitor.error.value));
	const awaitingSample = computed(() => props.enabled && !monitor.current.value && !monitor.error.value);

	async function copyHost() {
		if (!props.host) return;
		try {
			await navigator.clipboard.writeText(props.host);
			props.ctx.app.log.report({ level: 'info', code: 'WORKSPACE_HOST_COPIED', userVisible: true });
		} catch {
			props.ctx.app.log.report({
				level: 'warn',
				code: 'WORKSPACE_HOST_COPY_FAILED',
				userVisible: true,
			});
		}
	}

	async function closeTrend() {
		const key = selectedMetric.value;
		selectedMetric.value = null;
		await nextTick();
		scaleRoot.value
			?.querySelector<HTMLButtonElement>(`[data-status-metric="${key}"]`)
			?.focus({ preventScroll: true });
	}

	const normalizedPercent = (value?: number) => Math.round(Math.max(0, Math.min(100, Number(value) || 0)));

	const percent = (value?: number) => formatStatusPercent(value) ?? t('monitor.notAvailable');

	const metricName = (key: ResourceMetric) => {
		const label =
			key === 'cpu'
				? t('monitor.cpuPercent')
				: key === 'memory'
					? t('monitor.memPercent')
					: key === 'swap'
						? t('monitor.swapPercent')
						: t('monitor.diskPercent');
		return label.replace(/[:：]\s*$/, '');
	};

	const memory = (used?: number, total?: number) => formatStatusMemoryPair(used, total) ?? t('monitor.notAvailable');

	const swap = (used?: number, total?: number) => formatStatusSwapPair(used, total) ?? t('monitor.notAvailable');

	const disk = (used?: number, total?: number) => formatStatusDiskPair(used, total) ?? t('monitor.notAvailable');

	const capacityParts = (detail: string) => {
		const match = detail.match(/^([\d.]+) \/ ([\d.]+) (MB|GB)$/);
		return match ? { used: match[1], total: match[2], unit: match[3] } : null;
	};

	const compactRate = (bytesPerSecond?: number): string => {
		if (bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond)) {
			return '0B/s';
		}
		const value = Math.max(0, bytesPerSecond);
		if (value < 1024) {
			return `${Math.round(value)}B/s`;
		}
		if (value < 1024 ** 2) {
			return `${(value / 1024).toFixed(1)}K/s`;
		}
		if (value < 1024 ** 3) {
			return `${(value / 1024 ** 2).toFixed(1)}M/s`;
		}
		return `${(value / 1024 ** 3).toFixed(1)}G/s`;
	};

	const metricContext = (metric: { capacity?: ReturnType<typeof capacityParts>; load?: string }): string => {
		if (metric.capacity) {
			return `${metric.capacity.used} / ${metric.capacity.total} ${metric.capacity.unit}`;
		}
		return metric.load ? `${t('monitor.load')} ${metric.load}` : '';
	};

	const metricAriaLabel = (metric: {
		name: string;
		displayPercent: string;
		capacity?: ReturnType<typeof capacityParts>;
		load?: string;
	}): string => {
		const context = metricContext(metric);
		return context
			? `${metric.name} ${metric.displayPercent} ${context}`
			: `${metric.name} ${metric.displayPercent}`;
	};

	const metrics = computed<
		Array<{
			key: ResourceMetric;
			name: string;
			percent: number;
			displayPercent: string;
			detail: string;
			capacity?: ReturnType<typeof capacityParts>;
			load?: string;
			color: string;
			icon: Component;
		}>
	>(() => {
		const status = monitor.current.value;
		const firstLoadAverage = status?.loadAvg?.[0];
		const cpuLoad = firstLoadAverage === undefined ? '' : `${t('monitor.load')} ${firstLoadAverage.toFixed(2)}`;
		const cpuDetail =
			cpuLoad ||
			(status?.cpuModel
				? status.cpuModel.length > 20
					? `${status.cpuModel.slice(0, 18)}...`
					: status.cpuModel.trim()
				: '');

		return [
			{
				key: 'cpu',
				name: metricName('cpu'),
				percent: normalizedPercent(status?.cpuPercent),
				displayPercent: percent(status?.cpuPercent),
				detail: cpuDetail,
				load:
					firstLoadAverage !== undefined && Number.isFinite(firstLoadAverage)
						? firstLoadAverage.toFixed(2)
						: undefined,
				color: '#3b82f6',
				icon: CpuIcon,
			},
			{
				key: 'memory',
				name: metricName('memory'),
				percent: normalizedPercent(status?.memPercent),
				displayPercent: percent(status?.memPercent),
				detail: memory(status?.memUsed, status?.memTotal),
				capacity: capacityParts(memory(status?.memUsed, status?.memTotal)),
				color: '#10b981',
				icon: MemoryIcon,
			},
			{
				key: 'swap',
				name: metricName('swap'),
				percent: normalizedPercent(status?.swapPercent),
				displayPercent: percent(status?.swapPercent),
				detail: swap(status?.swapUsed, status?.swapTotal),
				capacity: capacityParts(swap(status?.swapUsed, status?.swapTotal)),
				color: '#8b5cf6',
				icon: SwapIcon,
			},
			{
				key: 'disk',
				name: metricName('disk'),
				percent: normalizedPercent(status?.diskPercent),
				displayPercent: percent(status?.diskPercent),
				detail: disk(status?.diskUsed, status?.diskTotal),
				capacity: capacityParts(disk(status?.diskUsed, status?.diskTotal)),
				color: '#f59e0b',
				icon: DiskIcon,
			},
		];
	});

	const metricColors = {
		cpu: '#3b82f6',
		memory: '#10b981',
		swap: '#8b5cf6',
		disk: '#f59e0b',
		network: '#14b8a6',
	} as const;
	const selectedMetricColor = computed(() => metricColors[selectedMetric.value ?? 'cpu']);
	const metricKeys = {
		cpu: 'cpuPercent',
		memory: 'memPercent',
		swap: 'swapPercent',
		disk: 'diskPercent',
		network: 'network',
	} as const;
	const selectedMetricTitle = computed(() =>
		t('monitor.trend', { name: t('monitor.' + metricKeys[selectedMetric.value ?? 'cpu']) }),
	);
	const selectedMetricValue = computed(() => {
		const status = monitor.current.value;
		if (!status || !selectedMetric.value || selectedMetric.value === 'network') {
			return '';
		}
		return selectedMetric.value === 'cpu'
			? percent(status.cpuPercent)
			: selectedMetric.value === 'memory'
				? percent(status.memPercent)
				: selectedMetric.value === 'swap'
					? percent(status.swapPercent)
					: percent(status.diskPercent);
	});

	const selectMetric = (metric: StatusMetric) => {
		selectedMetric.value = selectedMetric.value === metric ? null : metric;
	};
</script>

<template>
	<section
		ref="scaleRoot"
		:data-status-scale="localScale.toFixed(2)"
		class="status-monitor workspace-status-viewport"
	>
		<div v-if="awaitingSample" class="status-loading" role="status" :aria-busy="awaitingSample">
			<div class="status-loading-panel" :style="scaleStyle">
				<header class="status-loading-head">
					<LoaderCircle class="status-loading-spinner" :size="14" aria-hidden="true" />
					<span>{{ t('monitor.loading') }}</span>
				</header>
				<div class="status-loading-list" aria-hidden="true">
					<div v-for="index in 4" :key="index" class="status-loading-card">
						<span class="status-loading-icon"></span>
						<span class="status-loading-copy">
							<span class="status-loading-line status-loading-line--title"></span>
							<span class="status-loading-line status-loading-line--detail"></span>
						</span>
						<span class="status-loading-reading"></span>
						<span class="status-loading-track"></span>
					</div>
					<div class="status-loading-card status-loading-card--network">
						<span class="status-loading-icon"></span>
						<span class="status-loading-copy">
							<span class="status-loading-line status-loading-line--title"></span>
						</span>
						<span class="status-loading-interface"></span>
						<span class="status-loading-traffic">
							<i></i>
							<i></i>
						</span>
					</div>
				</div>
			</div>
		</div>
		<div
			v-else
			:style="scaleStyle"
			:data-status-scale="localScale.toFixed(2)"
			class="status-surface workspace-status-panel"
			:class="{ 'has-history': Boolean(selectedMetric), 'status-has-data': hasVisibleData }"
		>
			<div v-if="monitor.error.value" class="empty-state">
				<div class="status-error-notice" role="status">
					{{ t('monitor.failed', { code: String(monitor.error.value.code) }) }}
				</div>
			</div>
			<section v-else-if="monitor.current.value" class="monitor-panel">
				<header class="monitor-header">
					<strong>{{ t('monitor.title') }}</strong>
					<button
						v-if="host"
						type="button"
						class="live-state host-button status-touch-target"
						:title="t('monitor.copyHost')"
						:aria-label="t('monitor.copyHost') + ': ' + host"
						@click="copyHost"
					>
						<i class="status-dot"></i>
						<span class="host-name">{{ host }}</span>
					</button>
					<span v-else class="live-state"
						><i class="status-dot"></i><span class="live-label">{{ t('monitor.live') }}</span></span
					>
				</header>

				<div class="monitor-content" :class="{ 'has-history': Boolean(selectedMetric) }">
					<div class="metric-list">
						<button
							v-for="metric in metrics"
							:key="metric.key"
							type="button"
							class="metric-row"
							:data-status-metric="metric.key"
							:class="{
								selected: selectedMetric === metric.key,
								warning: metric.percent >= 65 && metric.percent < 90,
								critical: metric.percent >= 90,
							}"
							:style="{ '--metric-accent': metric.color, '--metric-value': `${metric.percent}%` }"
							:aria-label="metricAriaLabel(metric)"
							:aria-pressed="selectedMetric === metric.key"
							:title="metricAriaLabel(metric)"
							@click="selectMetric(metric.key)"
						>
							<span class="metric-icon"><component :is="metric.icon" /></span>
							<span class="metric-body">
								<span class="metric-topline">
									<span class="metric-name">{{ metric.name }}</span>
									<span v-if="metric.capacity" class="metric-value">
										<b>{{ metric.capacity.used }}</b>
										<span>/ {{ metric.capacity.total }} {{ metric.capacity.unit }}</span>
									</span>
									<span v-else-if="metric.load" class="metric-value">
										<b>{{ metric.load }}</b><span>{{ t('monitor.load') }}</span>
									</span>
									<span class="metric-reading">{{ metric.displayPercent }}</span>
								</span>
								<span
									class="metric-track"
									:class="{ 'is-low': metric.percent < 24 }"
									aria-hidden="true"
								>
									<i :style="{ width: `${metric.percent}%` }"></i>
									<span class="metric-track-label">{{ metric.displayPercent }}</span>
								</span>
							</span>
						</button>

						<button
							type="button"
							class="metric-row network-row"
							data-status-metric="network"
							:class="{ selected: selectedMetric === 'network' }"
							:style="{ '--metric-accent': metricColors.network }"
							:aria-label="`${t('monitor.network')} ↑ ${formatStatusRate(monitor.current.value.netTxRate)} ↓ ${formatStatusRate(monitor.current.value.netRxRate)}`"
							:aria-pressed="selectedMetric === 'network'"
							:title="`${t('monitor.network')} ↑ ${formatStatusRate(monitor.current.value.netTxRate)} ↓ ${formatStatusRate(monitor.current.value.netRxRate)}`"
							@click="selectMetric('network')"
						>
							<span class="metric-icon"><Activity aria-hidden="true" /></span>
							<span class="metric-body">
								<span class="metric-topline">
									<span class="metric-name">{{ t('monitor.network') }}</span>
									<span v-if="monitor.current.value.netInterface" class="network-interface">{{
										monitor.current.value.netInterface
									}}</span>
								</span>
								<span class="network-reading">
									<span class="rate rate-up">
										<ArrowUp aria-hidden="true" />
										<b>{{ compactRate(monitor.current.value.netTxRate) }}</b>
									</span>
									<span class="rate rate-down">
										<ArrowDown aria-hidden="true" />
										<b>{{ compactRate(monitor.current.value.netRxRate) }}</b>
									</span>
								</span>
							</span>
						</button>
					</div>

					<section
						v-if="selectedMetric"
						class="history-card"
						:aria-label="selectedMetricTitle"
						:style="{ '--history-accent': selectedMetricColor }"
					>
						<header class="history-header">
							<div
								class="history-heading"
								:class="{ 'history-heading--network': selectedMetric === 'network' }"
							>
								<strong>{{ selectedMetricTitle }}</strong>
								<span v-if="selectedMetricValue" class="history-current">{{
									selectedMetricValue
								}}</span>
								<div v-if="selectedMetric === 'network'" class="network-legend">
									<span
										><i class="legend-download" aria-hidden="true"></i>↓
										{{ compactRate(monitor.current.value.netRxRate) }}</span
									>
									<span
										><i class="legend-upload" aria-hidden="true"></i>↑
										{{ compactRate(monitor.current.value.netTxRate) }}</span
									>
								</div>
								<button
									type="button"
									class="history-close"
									:aria-label="t('monitor.closeTrend')"
									@click="closeTrend"
								>
									<X :size="12" aria-hidden="true" />
								</button>
							</div>
							<div class="range-tabs" role="group" :aria-label="t('monitor.historyRange')">
								<button
									v-for="range in ranges"
									:key="range"
									type="button"
									:class="{ active: historyRange === range }"
									:aria-pressed="historyRange === range"
									:aria-label="t('monitor.minutes', { count: range })"
									@click="historyRange = range"
								>
									{{ t('monitor.minutesShort', { count: range }) }}
								</button>
							</div>
						</header>
						<StatusCharts
							:history="monitor.history.value"
							:sample-timestamp="monitor.current.value.timestamp"
							:metric="selectedMetric"
							:range-minutes="historyRange"
							:scale="localScale"
							:i18n="i18n"
						/>
					</section>
				</div>
			</section>
		</div>
	</section>
</template>

<style scoped src="./server-status.css"></style>
