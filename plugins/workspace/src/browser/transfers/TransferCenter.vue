<script setup lang="ts">
	import { groupTransferTasks } from './transfer-presentation';
	import { ref, computed } from 'vue';
	import {
		ArrowDownUp,
		Upload,
		Download,
		Copy,
		Scissors,
		Archive,
		PackageOpen,
		MoreHorizontal,
		X,
		RotateCcw,
		Trash2,
		Check,
		CircleAlert,
		ChevronRight,
	} from '@lucide/vue';
	import { UiButton, UiTabs, UiScrollArea, UiDropdownMenu, UiDialog, UiEmptyState } from 'nexus-terminal/browser/ui';
	import type { UiMenuItem } from 'nexus-terminal/browser/ui';
	import type { WorkspaceTransfers } from './workspace-transfers';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import { isTransferFinished, type TransferTask } from '../../shared/workspace-transfer-types';
	const props = defineProps<{ transfers: WorkspaceTransfers; i18n: WorkspaceI18n; narrow: boolean }>();
	const { t } = props.i18n;
	const section = ref('active'),
		expanded = ref<string>(),
		canceling = ref<TransferTask>(),
		overwriting = ref<TransferTask>();
	const groups = computed(() => groupTransferTasks(props.transfers.tasks.value));
	const list = computed(() =>
		groups.value.filter((task) =>
			section.value === 'active' ? !isTransferFinished(task.state) : isTransferFinished(task.state),
		),
	);

	const members = (task: TransferTask) =>
		task.batchId ? props.transfers.tasks.value.filter((item) => item.batchId === task.batchId) : [task];

	const canRetry = (task: TransferTask) => members(task).some(props.transfers.canRetry);

	const retry = (task: TransferTask, overwrite = false) =>
		Promise.all(
			members(task)
				.filter(props.transfers.canRetry)
				.map((item) => props.transfers.retry(item, overwrite)),
		);

	const cancel = (task: TransferTask) =>
		Promise.all(
			members(task)
				.filter((item) => !isTransferFinished(item.state))
				.map((item) => props.transfers.cancel(item)),
		);

	const icons = {
		upload: Upload,
		download: Download,
		copy: Copy,
		move: Scissors,
		compress: Archive,
		extract: PackageOpen,
	};

	const bytes = (value: number) => {
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const index = Math.min(4, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024)));
		return props.i18n.n(Math.round((value / 1024 ** index) * 10) / 10) + ' ' + units[index];
	};

	const percent = (task: TransferTask) =>
		task.state === 'completed'
			? 100
			: task.totalBytes
				? Math.min(99, Math.floor((task.bytes / task.totalBytes) * 100))
				: undefined;

	const remaining = (task: TransferTask) =>
		task.speed > 0 && task.totalBytes && task.totalBytes > task.bytes
			? t('transferCenter.remaining', { seconds: Math.ceil((task.totalBytes - task.bytes) / task.speed) })
			: '';

	function items(task: TransferTask): UiMenuItem[] {
		return [
			{ id: 'details', label: t('transferCenter.details'), icon: ChevronRight },
			...(!isTransferFinished(task.state)
				? [{ id: 'cancel', label: t('transferCenter.cancel'), icon: X, tone: 'danger' as const }]
				: []),
			...(canRetry(task) ? [{ id: 'retry', label: t('transferCenter.retry'), icon: RotateCcw }] : []),
			...(task.error?.code === 'WORKSPACE_FILE_EXISTS' && canRetry(task)
				? [{ id: 'overwrite', label: t('transferCenter.overwrite'), icon: Copy }]
				: []),
		];
	}

	function select(task: TransferTask, id: string) {
		if (id === 'details') expanded.value = expanded.value === task.id ? undefined : task.id;
		if (id === 'cancel') canceling.value = task;
		if (id === 'overwrite') overwriting.value = task;
		if (id === 'retry') void retry(task);
	}

	let touchY: number | undefined;
</script>
<template>
	<UiDialog
		:open="transfers.open.value"
		:modal="narrow"
		:title="t('transferCenter.title')"
		:close-label="t('transferCenter.hide')"
		:close-on-interact-outside="narrow"
		class="workspace-transfer-center"
		:data-narrow="narrow"
		@update:open="transfers.open.value = $event"
	>
		<template #title>
			<ArrowDownUp :size="19" />{{ t('transferCenter.title') }}
			<span v-if="transfers.active.value.length" class="workspace-transfer-count">{{
				transfers.active.value.length
			}}</span>
		</template>
		<template #body
			><div class="workspace-transfer-body">
				<div
					v-if="narrow"
					class="workspace-transfer-handle"
					@touchstart.passive="touchY = $event.touches[0].clientY"
					@touchend.passive="
						touchY !== undefined &&
						$event.changedTouches[0].clientY - touchY > 60 &&
						(transfers.open.value = false)
					"
				>
					<span />
				</div>
				<UiTabs
					v-model="section"
					:label="t('transferCenter.title')"
					:options="[
						{ value: 'active', label: t('transferCenter.active') },
						{ value: 'history', label: t('transferCenter.history') },
					]"
					class="workspace-transfer-tabs"
				/>
				<UiScrollArea class="workspace-transfer-list">
					<UiEmptyState
						v-if="!list.length"
						:icon="ArrowDownUp"
						:title="
							t(
								!transfers.connected.value
									? 'transferCenter.reconnecting'
									: section === 'active'
										? 'transferCenter.empty'
										: 'transferCenter.emptyHistory',
							)
						"
					/>
					<article
						v-for="task in list"
						:key="task.id"
						class="workspace-transfer-task"
						:data-state="task.state"
					>
						<div class="workspace-transfer-task-head">
							<span class="workspace-transfer-kind"><component :is="icons[task.kind]" :size="18" /></span
							><button
								class="workspace-transfer-name"
								:title="task.label"
								@click="expanded = expanded === task.id ? undefined : task.id"
							>
								<strong>{{ task.label }}</strong><small
									>{{ t('transferCenter.kinds.' + task.kind)
									}}<template v-if="task.paths.length > 1">
										· {{ t('transferCenter.extra', { count: task.paths.length - 1 }) }}</template
									><template v-if="task.method">
										· {{ t('transferCenter.methods.' + task.method) }}</template
									></small
								></button
							><UiDropdownMenu
								:items="items(task)"
								:label="t('transferCenter.more')"
								@select="select(task, $event)"
								><UiButton appearance="ghost" icon-only :aria-label="t('transferCenter.more')"
									><MoreHorizontal :size="18" /></UiButton
							></UiDropdownMenu>
						</div>
						<p class="workspace-transfer-route">
							<span>{{ task.source || t('transferCenter.local') }}</span><span aria-hidden="true">→</span
							><span>{{ task.destination || t('transferCenter.local') }}</span>
						</p>
						<progress
							class="workspace-transfer-progress"
							:class="{
								'is-indeterminate': percent(task) === undefined && !isTransferFinished(task.state),
							}"
							:value="percent(task)"
							max="100"
							:aria-label="t('transferCenter.kinds.' + task.kind)"
						/>
						<div class="workspace-transfer-facts">
							<span
								><Check v-if="task.state === 'completed'" :size="13" /><CircleAlert
									v-else-if="task.state === 'failed' || task.state === 'unknown'"
									:size="13"
								/>{{
									['transferring', 'completed'].includes(task.state) && percent(task) !== undefined
										? percent(task) + '%'
										: t('transferCenter.states.' + task.state)
								}}</span
							><span>{{
								task.state === 'transferring' && task.speed
									? bytes(task.speed) + '/s'
									: task.method
										? t('transferCenter.methods.' + task.method)
										: ''
							}}</span>
						</div>
						<div class="workspace-transfer-secondary">
							<span>{{
								task.totalBytes !== null
									? bytes(task.bytes) + ' / ' + bytes(task.totalBytes)
									: task.currentFile
							}}</span><span>{{ remaining(task) }}</span>
						</div>
						<p v-if="task.error" class="workspace-transfer-error">
							{{ t('transferCenter.states.' + task.state) }} · {{ task.error.source }} /
							{{ task.error.code }}
						</p>
						<div v-if="expanded === task.id" class="workspace-transfer-details">
							<dl>
								<dt>{{ t('transferCenter.from') }}</dt>
								<dd v-for="path in task.paths" :key="path">{{ path }}</dd>
								<dt>{{ t('transferCenter.to') }}</dt>
								<dd>{{ task.destinationPath || t('transferCenter.local') }}</dd>
							</dl>
							<p v-if="task.fallback">{{ t('transferCenter.fallback') }}</p>
							<p v-if="task.currentFile">{{ task.currentFile }}</p>
							<p v-if="task.kind === 'download' && task.state === 'completed'">
								{{ t('transferCenter.browser') }}
							</p>
							<p v-if="task.state === 'unknown'">{{ t('transferCenter.unknown') }}</p>
						</div>
					</article>
				</UiScrollArea>
				<footer class="workspace-transfer-footer">
					<span>{{ !transfers.connected.value ? t('transferCenter.reconnecting') : '' }}</span><UiButton
						appearance="ghost"
						:disabled="!transfers.history.value.length"
						@click="transfers.clear()"
						><Trash2 :size="14" />{{ t('transferCenter.clear') }}</UiButton
					>
				</footer>
			</div></template
		>
	</UiDialog>
	<UiDialog
		:open="!!canceling"
		:title="t('transferCenter.cancelTitle')"
		:description="t('transferCenter.cancelHint')"
		:close-label="t('close')"
		@update:open="!$event && (canceling = undefined)"
		><template #footer
			><UiButton @click="canceling = undefined">{{ t('transferCenter.keep') }}</UiButton
			><UiButton
				tone="danger"
				@click="
					cancel(canceling!);
					canceling = undefined;
				"
				>{{ t('transferCenter.cancel') }}</UiButton
			></template
		></UiDialog
	>
	<UiDialog
		:open="!!overwriting"
		:title="t('transferCenter.overwrite')"
		:description="t('filesMenu.overwriteHint')"
		:close-label="t('close')"
		@update:open="!$event && (overwriting = undefined)"
		><template #footer
			><UiButton @click="overwriting = undefined">{{ t('cancel') }}</UiButton
			><UiButton
				tone="danger"
				@click="
					retry(overwriting!, true);
					overwriting = undefined;
				"
				>{{ t('transferCenter.overwrite') }}</UiButton
			></template
		></UiDialog
	>
</template>
<style>
	.ui-dialog.workspace-transfer-center {
		position: fixed;
		inset: auto 24px 24px auto;
		transform: none;
		max-height: none;
		z-index: var(--ui-dialog-z-index, 100);
		display: flex;
		flex-direction: column;
		width: min(410px, calc(100vw - 32px));
		height: min(510px, calc(100dvh - 96px));
		overflow: hidden;
		outline: none;
		border: 1px solid var(--ui-border);
		border-radius: 22px;
		background: var(--ui-surface);
		color: var(--ui-text);
		box-shadow: 0 20px 70px #10132326;
		font-size: 13px;
		user-select: none;
	}
	.workspace-transfer-center[data-narrow='true'] {
		inset: auto 0 0;
		width: 100%;
		height: min(76dvh, 740px);
		padding-bottom: env(safe-area-inset-bottom);
		border-bottom: 0;
		border-radius: 25px 25px 0 0;
	}
	.workspace-transfer-handle {
		display: flex;
		flex-shrink: 0;
		justify-content: center;
		align-items: center;
		height: 23px;
		touch-action: none;
		position: absolute;
		inset: 0 0 auto;
	}
	.workspace-transfer-handle span {
		width: 36px;
		height: 4px;
		border-radius: 4px;
		background: var(--ui-border);
	}
	.workspace-transfer-center > .ui-dialog__header {
		align-items: center;
		padding: 17px 20px 9px;
	}
	.workspace-transfer-center[data-narrow='true'] > .ui-dialog__header {
		padding-top: 23px;
	}
	.workspace-transfer-center .ui-dialog__title {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font-size: 16px;
		font-weight: 650;
	}
	.workspace-transfer-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		padding: 0;
		overflow: hidden;
	}

	.workspace-transfer-count {
		background: color-mix(in srgb, var(--ui-primary) 13%, transparent);
		color: var(--ui-primary);
		border-radius: 7px;
		padding: 2px 7px;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.workspace-transfer-tabs {
		flex: 0 0 auto;
		margin: 0 20px 8px;
	}
	.workspace-transfer-list {
		flex: 1;
		min-height: 0;
	}
	.workspace-transfer-task {
		margin: 0 20px;
		padding: 17px 0;
		border-bottom: 1px solid var(--ui-border);
	}
	.workspace-transfer-task:last-child {
		border-bottom: 0;
	}
	.workspace-transfer-task-head {
		display: flex;
		gap: 11px;
		align-items: center;
	}
	.workspace-transfer-kind {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 11px;
		background: color-mix(in srgb, var(--ui-primary) 9%, transparent);
		color: var(--ui-primary);
	}
	.workspace-transfer-name {
		min-width: 0;
		flex: 1;
		display: grid;
		gap: 4px;
		border: 0;
		padding: 0;
		background: none;
		color: inherit;
		text-align: start;
		cursor: pointer;
		font: inherit;
	}
	.workspace-transfer-name strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 600;
	}
	.workspace-transfer-name small {
		color: var(--ui-muted);
		font-size: 11px;
	}
	.workspace-transfer-route {
		display: flex;
		gap: 9px;
		align-items: center;
		margin: 12px 0 10px;
		color: var(--ui-muted);
		font-size: 11px;
	}
	.workspace-transfer-route span:not([aria-hidden]) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.workspace-transfer-progress {
		display: block;
		appearance: none;
		width: 100%;
		height: 5px;
		overflow: hidden;
		border: 0;
		border-radius: 4px;
		background: color-mix(in srgb, var(--ui-text) 8%, transparent);
	}
	.workspace-transfer-progress::-webkit-progress-bar {
		background: color-mix(in srgb, var(--ui-text) 8%, transparent);
		border-radius: 4px;
	}
	.workspace-transfer-progress::-webkit-progress-value {
		background: var(--ui-primary);
		border-radius: 4px;
		transition: width 0.2s ease;
	}
	.workspace-transfer-progress::-moz-progress-bar {
		background: var(--ui-primary);
		border-radius: 4px;
	}
	.workspace-transfer-progress.is-indeterminate {
		background: linear-gradient(90deg, transparent, var(--ui-primary), transparent) 0 0 / 50% 100% no-repeat;
		animation: workspace-transfer-pulse 1.5s infinite ease-in-out;
	}
	.workspace-transfer-facts,
	.workspace-transfer-secondary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 9px;
		font-variant-numeric: tabular-nums;
	}
	.workspace-transfer-facts {
		min-height: 17px;
		font-size: 11px;
	}
	.workspace-transfer-facts > span:first-child {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.workspace-transfer-secondary {
		min-height: 14px;
		margin-top: 5px;
		color: var(--ui-muted);
		font-size: 10px;
	}
	.workspace-transfer-secondary > span:first-child {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.workspace-transfer-task[data-state='failed'] .workspace-transfer-facts,
	.workspace-transfer-task[data-state='unknown'] .workspace-transfer-facts,
	.workspace-transfer-error {
		color: var(--ui-danger);
	}
	.workspace-transfer-error {
		margin: 9px 0 0;
		font-size: 11px;
		overflow-wrap: anywhere;
	}
	.workspace-transfer-details {
		margin-top: 13px;
		padding: 11px 12px;
		border-radius: 11px;
		background: color-mix(in srgb, var(--ui-text) 4%, transparent);
		color: var(--ui-muted);
		font-size: 11px;
		line-height: 1.6;
		overflow-wrap: anywhere;
		user-select: text;
	}
	.workspace-transfer-details dl,
	.workspace-transfer-details p {
		margin: 0;
	}
	.workspace-transfer-details dt {
		margin-top: 5px;
		color: var(--ui-text);
	}
	.workspace-transfer-details dd {
		margin: 0;
	}
	.workspace-transfer-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-shrink: 0;
		min-height: 48px;
		padding: 4px 12px 5px 20px;
		border-top: 1px solid var(--ui-border);
		font-size: 10px;
		color: var(--ui-muted);
	}
	.workspace-transfer-action-icon {
		position: relative;
		display: inline-flex;
	}
	.workspace-transfer-action-icon small {
		position: absolute;
		top: -6px;
		right: -7px;
		min-width: 12px;
		height: 12px;
		padding: 0 2px;
		display: grid;
		place-items: center;
		background: var(--ui-primary);
		color: white;
		border-radius: 5px;
		font-size: 8px;
		line-height: 1;
	}
	@keyframes workspace-transfer-pulse {
		0%,
		100% {
			background-position: -100% 0;
		}
		50% {
			background-position: 200% 0;
		}
	}
	html[data-ui-motion='reduced'] .workspace-transfer-progress {
		animation: none !important;
	}
	html[data-ui-motion='reduced'] .workspace-transfer-progress::-webkit-progress-value {
		transition: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.workspace-transfer-progress {
			animation: none !important;
		}
		.workspace-transfer-progress::-webkit-progress-value {
			transition: none;
		}
	}
</style>
