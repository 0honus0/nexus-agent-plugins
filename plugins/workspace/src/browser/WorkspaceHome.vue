<script setup lang="ts">
	import { computed, ref } from 'vue';
	import {
		Server,
		Monitor,
		ScreenShare,
		Search,
		ChevronDown,
		Tags,
		Play,
		X,
		LoaderCircle,
		ArrowUpRight,
	} from '@lucide/vue';
	import { CollapsibleRoot, CollapsibleTrigger, CollapsibleContent } from 'reka-ui';
	import { UiButton, UiCard, UiInput, UiSelect } from 'nexus-terminal/browser/ui';
	import { type Connection } from '@nexus-terminal/connections/connections-client-api';
	import type { SessionInfo } from '../shared/workspace-types';
	import type { WorkspaceI18n } from './workspace-i18n';
	const props = defineProps<{
		connections: Connection[];
		suspended: SessionInfo[];
		connectionsAvailable: boolean;
		connectionsLoaded: boolean;
		connectionsReadFailed: boolean;
		connecting: boolean;
		selected: string;
		i18n: WorkspaceI18n;
	}>();
	const emit = defineEmits<{
		connect: [id: string];
		resume: [session: SessionInfo];
		close: [id: string];
		manage: [];
		retry: [];
	}>();
	const { t } = props.i18n;
	const search = ref(''),
		type = ref('all');
	const icons = { ssh: Server, rdp: Monitor, vnc: ScreenShare };
	const typeOptions = computed(() => [
		{ value: 'all', label: t('allTypes') },
		...(['ssh', 'rdp', 'vnc'] as const).map((value) => ({
			value,
			label: t('connectionTypes.' + value),
		})),
	]);
	const groups = computed(() => {
		const query = search.value.trim().toLocaleLowerCase();
		const groups = new Map<string, Connection[]>();
		for (const connection of props.connections) {
			if (type.value !== 'all' && connection.type !== type.value) continue;
			if (
				query &&
				![connection.name, connection.host, ...connection.tags].some((value) =>
					value.toLocaleLowerCase().includes(query),
				)
			)
				continue;
			for (const tag of connection.tags.length ? connection.tags : ['']) {
				const items = groups.get(tag) ?? [];
				items.push(connection);
				groups.set(tag, items);
			}
		}
		return [...groups]
			.sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))
			.map(([tag, items]) => ({ tag, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
	});

	const address = (connection: Connection) =>
		`${connection.host.includes(':') ? '[' + connection.host + ']' : connection.host}:${connection.port}`;
</script>
<template>
	<div class="workspace-home">
		<header class="workspace-home-heading">
			<div>
				<h2>{{ t('subtitle') }}</h2>
				<p>{{ t('description') }}</p>
			</div>
			<UiButton :disabled="!connectionsAvailable" @click="emit('manage')"
				><ArrowUpRight :size="16" />{{ t('manage') }}</UiButton
			>
		</header>
		<div class="workspace-home-filters">
			<div class="workspace-home-search">
				<UiInput
					v-model="search"
					density="touch"
					:placeholder="t('searchConnections')"
					:aria-label="t('searchConnections')"
					><template #leading><Search :size="17" /></template
				></UiInput>
			</div>
			<UiSelect v-model="type" :options="typeOptions" :aria-label="t('filterType')" density="touch" />
		</div>
		<section v-if="suspended.length" class="workspace-suspended">
			<h3>
				<Play :size="16" />{{ t('sessions') }}<span>{{ suspended.length }}</span>
			</h3>
			<div class="workspace-home-grid">
				<UiCard
					v-for="session in suspended"
					:key="session.id"
					:title="session.name"
					:description="t('suspended')"
					:action-label="t('resume') + ' · ' + session.name"
					:icon="Play"
					@select="emit('resume', session)"
				>
					<template #actions
						><UiButton
							appearance="ghost"
							density="compact"
							icon-only
							:aria-label="t('closeSession') + ' · ' + session.name"
							@click="emit('close', session.id)"
							><X :size="15" /></UiButton
					></template>
				</UiCard>
			</div>
		</section>
		<div class="workspace-home-groups" :aria-busy="!connectionsLoaded && !connectionsReadFailed">
			<div v-if="!connectionsLoaded" class="workspace-home-empty">
				<template v-if="connectionsReadFailed">
					<p>{{ t('connectionsReadFailed') }}</p>
					<UiButton @click="emit('retry')">{{ t('retryConnections') }}</UiButton>
				</template>
				<p v-else role="status">{{ t('loadingConnections') }}</p>
			</div>
			<CollapsibleRoot v-for="group in groups" :key="group.tag" :default-open="true" class="workspace-group">
				<CollapsibleTrigger class="workspace-group-heading"
					><Tags :size="16" /><span>{{ group.tag || t('ungrouped') }}</span
					><small>{{ group.items.length }}</small
					><ChevronDown :size="16" class="workspace-group-chevron"
				/></CollapsibleTrigger>
				<CollapsibleContent
					><div class="workspace-home-grid workspace-connections">
						<UiCard
							v-for="connection in group.items"
							:key="connection.id"
							class="workspace-connection-card"
							:title="connection.name"
							:description="address(connection)"
							:icon="icons[connection.type]"
							:action-label="connection.name"
							:disabled="connection.type !== 'ssh' || connecting"
							:aria-busy="connecting && selected === connection.id"
							@select="emit('connect', connection.id)"
						>
							<template #icon
								><LoaderCircle
									v-if="connecting && selected === connection.id"
									:size="23"
									class="workspace-connection-spinner" /><component
									v-else
									:is="icons[connection.type]"
									:size="23"
							/></template>
							<template #tags
								><span class="workspace-protocol">{{ t('connectionTypes.' + connection.type) }}</span
								><span v-if="connection.type !== 'ssh'" class="workspace-connection-hint">{{
									t('unsupportedConnection')
								}}</span
								><span v-else-if="!connection.credentialId" class="workspace-connection-hint">{{
									t('noCredential')
								}}</span></template
							>
						</UiCard>
					</div></CollapsibleContent
				>
			</CollapsibleRoot>
			<p v-if="connectionsLoaded && !groups.length" class="workspace-home-empty">
				{{ t(connections.length ? 'noConnectionsMatch' : 'emptyHint') }}
			</p>
		</div>
	</div>
</template>
