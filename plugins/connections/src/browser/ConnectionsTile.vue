<script setup lang="ts">
	import { computed, onMounted, watchEffect, type Component, type Ref } from 'vue';
	import { Server, Terminal, Monitor, ScreenShare } from '@lucide/vue';
	import { UiActionCard } from 'nexus-terminal/browser/ui';
	import type { PluginApplicationTileProps } from 'nexus-terminal/browser';
	import type { ConnectionsClient } from './connections-client-api.js';
	import { useI18n } from 'vue-i18n';
	import { messages } from './messages.js';
	import type { ConnectionType } from '../shared/connection-types';
	const props = defineProps<PluginApplicationTileProps & { runtime: ConnectionsClient; label: Ref<string> }>();
	const { t, n } = useI18n({ useScope: 'local', messages });
	watchEffect(() => (props.label.value = t('title')));
	const { catalog, loaded } = props.runtime;
	const shape = computed(() =>
		props.size.columns === 1 && props.size.rows === 1
			? 'compact'
			: props.size.columns > props.size.rows
				? 'wide'
				: props.size.rows > props.size.columns
					? 'tall'
					: 'square',
	);
	const icons = { ssh: Terminal, rdp: Monitor, vnc: ScreenShare } satisfies Record<ConnectionType, Component>;
	const groups = computed(() => {
		const counts = new Map<ConnectionType, number>();
		for (const connection of catalog.value.connections)
			counts.set(connection.type, (counts.get(connection.type) ?? 0) + 1);
		return Object.entries(icons).map(([type, icon]) => ({
			type,
			icon,
			count: counts.get(type as ConnectionType) ?? 0,
		}));
	});
	onMounted(() => {
		if (!loaded.value)
			void props.runtime
				.refresh(props.view.signal)
				.catch((cause) => props.runtime.report(cause, props.view.signal));
	});
</script>
<template>
	<UiActionCard class="connections-tile" :data-shape="shape" :label="t('title')" @click="open">
		<span class="connections-tile__header"
			><Server v-if="shape !== 'compact'" :size="14" aria-hidden="true" /><span>{{ t('title') }}</span></span
		>
		<span class="connections-tile__summary">
			<span class="connections-tile__total"
				><strong>{{ loaded ? n(catalog.connections.length) : '—' }}</strong
				><span>{{ t('tile.saved') }}</span></span
			>
			<span v-if="shape !== 'compact'" class="connections-tile__groups">
				<span v-for="group in groups" :key="group.type" class="connections-tile__group" :data-type="group.type">
					<span class="connections-tile__group-label"
						><component :is="group.icon" :size="15" aria-hidden="true" /><span>{{
							t(`types.${group.type}`)
						}}</span></span
					>
					<strong>{{ loaded ? n(group.count) : '—' }}</strong>
				</span>
			</span>
		</span>
	</UiActionCard>
</template>
<style scoped>
	.connections-tile {
		--_ink: var(--ui-connections-tile-text, var(--ui-text));
		--_muted: var(--ui-connections-tile-muted, var(--ui-muted));
		--_accent: var(--ui-connections-tile-accent, var(--ui-primary));
		--ui-action-card-padding: clamp(10px, 6cqmin, 18px);
		--ui-action-card-background: var(
			--ui-connections-tile-background,
			color-mix(in srgb, var(--_accent) 8%, var(--ui-surface))
		);
		--ui-action-card-text: var(--_ink);
	}
	.connections-tile :deep(.ui-action-card__content) {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.connections-tile__header {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		flex: none;
		color: var(--_muted);
		font-size: 11px;
		font-weight: 550;
		line-height: 1.3;
	}
	.connections-tile__header > svg {
		flex: none;
	}
	.connections-tile__header > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.connections-tile__summary {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
		flex: 1;
		min-height: 0;
	}
	.connections-tile__total {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 0;
	}
	.connections-tile__total strong {
		color: var(--_accent);
		font-size: clamp(24px, 30cqmin, 42px);
		line-height: 1;
		font-weight: 550;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
	.connections-tile__total > span {
		font-size: 10px;
		line-height: 1.2;
		color: var(--_muted);
	}
	.connections-tile__groups {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		min-width: 0;
	}
	.connections-tile__group {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 0;
		padding: 10px 4px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--_accent) 7%, transparent);
	}
	.connections-tile__group-label {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		color: var(--_muted);
		font-size: 9px;
		line-height: 1;
		letter-spacing: 0.03em;
	}
	.connections-tile__group-label > svg {
		color: var(--_accent);
		flex: none;
	}
	.connections-tile__group > strong {
		font-size: 19px;
		font-weight: 550;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.connections-tile[data-shape='compact'] :deep(.ui-action-card__content) {
		gap: 5px;
	}
	.connections-tile[data-shape='compact'] .connections-tile__header {
		order: 1;
		justify-content: center;
		color: var(--_ink);
	}
	.connections-tile[data-shape='tall'] .connections-tile__header > svg {
		display: none;
	}
	.connections-tile[data-shape='tall'] .connections-tile__summary {
		gap: 16px;
	}
	.connections-tile[data-shape='tall'] .connections-tile__groups {
		grid-template-columns: minmax(0, 1fr);
		gap: 0;
	}
	.connections-tile[data-shape='tall'] .connections-tile__group {
		flex-direction: row;
		justify-content: space-between;
		padding: 9px 0;
		background: none;
		border-radius: 0;
	}
	.connections-tile[data-shape='tall'] .connections-tile__group + .connections-tile__group {
		border-top: 1px solid color-mix(in srgb, var(--_accent) 14%, transparent);
	}
	.connections-tile[data-shape='tall'] .connections-tile__group-label > svg {
		display: none;
	}
	.connections-tile[data-shape='tall'] .connections-tile__group > strong {
		font-size: 15px;
	}
	.connections-tile[data-shape='wide'] .connections-tile__summary {
		display: grid;
		grid-template-columns: minmax(34px, 0.8fr) minmax(0, 3fr);
		align-items: center;
		gap: 10px;
	}
	.connections-tile[data-shape='wide'] .connections-tile__total strong {
		font-size: clamp(24px, 30cqmin, 36px);
	}
	.connections-tile[data-shape='wide'] .connections-tile__groups {
		padding-inline-start: 10px;
		border-inline-start: 1px solid color-mix(in srgb, var(--_accent) 20%, transparent);
		gap: 4px;
	}
	.connections-tile[data-shape='wide'] .connections-tile__group {
		padding: 0;
		background: none;
		gap: 7px;
	}
	.connections-tile[data-shape='wide'] .connections-tile__group-label > svg {
		display: none;
	}
	.connections-tile[data-shape='wide'] .connections-tile__group > strong {
		font-size: 18px;
	}
	.connections-tile[data-shape='square'] :deep(.ui-action-card__content) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto minmax(0, 1fr);
		column-gap: 8px;
		row-gap: 10px;
		align-items: center;
	}
	.connections-tile[data-shape='square'] .connections-tile__header > svg {
		display: none;
	}
	.connections-tile[data-shape='square'] .connections-tile__summary {
		display: contents;
	}
	.connections-tile[data-shape='square'] .connections-tile__total {
		flex: none;
		white-space: nowrap;
		flex-direction: row;
		justify-content: center;
		align-items: baseline;
		gap: 8px;
	}
	.connections-tile[data-shape='square'] .connections-tile__total strong {
		font-size: clamp(20px, 12cqmin, 24px);
	}
	.connections-tile[data-shape='square'] .connections-tile__groups {
		grid-column: 1 / -1;
		align-self: stretch;
		min-height: 0;
		grid-template-rows: repeat(3, minmax(0, 1fr));
		grid-template-columns: minmax(0, 1fr);
		gap: 0;
	}
	.connections-tile[data-shape='square'] .connections-tile__group {
		min-height: 0;
		flex-direction: row;
		justify-content: space-between;
		padding: 4px 0;
		border-radius: 0;
		background: none;
	}
	.connections-tile[data-shape='square'] .connections-tile__group + .connections-tile__group {
		border-top: 1px solid color-mix(in srgb, var(--_accent) 8%, transparent);
	}
	.connections-tile[data-shape='square'] .connections-tile__group-label {
		flex-direction: row;
		gap: 8px;
		font-size: 11px;
	}
	.connections-tile[data-shape='square'] .connections-tile__group > strong {
		font-size: 16px;
	}
</style>
