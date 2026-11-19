<script setup lang="ts">
	import { ref, computed, onMounted, watchEffect, type Ref } from 'vue';
	import { KeyRound, LockKeyhole, Plus, Search, Trash2, RefreshCw } from '@lucide/vue';
	import { UiInput, UiButton, UiSelect, UiCard, UiBadge, UiEmptyState, UiDialog } from 'nexus-terminal/browser/ui';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import { useI18n } from 'vue-i18n';
	import { messages } from './messages.js';
	import type { CredentialsClient } from './credentials-client-api.js';
	import type { Credential } from '../shared/credentials-types';
	import CredentialEditor from './CredentialEditor.vue';
	const props = defineProps<PluginWindowProps & { runtime: CredentialsClient; label: Ref<string> }>();
	const { t } = useI18n({ useScope: 'local', messages });
	watchEffect(() => (props.label.value = t('title')));
	const { items, loaded, pending: requests } = props.runtime;
	const loading = computed(() => requests.value > 0);

	function refresh() {
		void props.runtime.refresh(props.view.signal).catch((cause) => props.runtime.report(cause, props.view.signal));
	}

	const search = ref(''),
		type = ref('all'),
		editor = ref<{ credential?: Credential }>(),
		pending = ref<Credential>(),
		deleting = ref(false);
	const types = computed(() => [
		{ value: 'all', label: t('all') },
		{ value: 'password', label: t('passwordType') },
		{ value: 'privateKey', label: t('privateKeyType') },
	]);
	const entries = computed(() =>
		items.value.filter(
			(v) =>
				(type.value === 'all' || v.type === type.value) &&
				[v.name, v.username].some((s) => s.toLowerCase().includes(search.value.trim().toLowerCase())),
		),
	);
	onMounted(refresh);

	async function remove() {
		if (!pending.value || deleting.value || props.view.signal.aborted) return;
		deleting.value = true;
		try {
			await props.runtime.remove(pending.value.id, props.view);
			pending.value = undefined;
		} catch (e) {
			props.runtime.report(e, props.view.signal);
		} finally {
			deleting.value = false;
		}
	}
</script>
<template>
	<section class="credentials-app" data-ui-selection="none">
		<header class="credentials-toolbar">
			<div class="credentials-search">
				<UiInput v-model="search" :placeholder="t('search')" :aria-label="t('search')"
					><template #leading><Search :size="17" /></template
				></UiInput>
			</div>
			<div class="credentials-filter">
				<UiSelect v-model="type" :options="types" :aria-label="t('type')" block />
			</div>
			<div class="credentials-toolbar-actions">
				<UiButton
					appearance="ghost"
					icon-only
					:loading="loading"
					loading-animation="icon"
					:aria-label="t('refresh')"
					@click="refresh"
					><RefreshCw :size="17"
				/></UiButton>
				<UiButton tone="primary" @click="editor = {}"><Plus :size="17" />{{ t('add') }}</UiButton>
			</div>
		</header>
		<div class="credentials-list" :aria-busy="loading">
			<UiCard
				v-for="item in entries"
				:key="item.id"
				class="credentials-card"
				:title="item.name"
				:description="item.username"
				:icon="item.type === 'password' ? LockKeyhole : KeyRound"
				tone="primary"
				@select="editor = { credential: item }"
			>
				<template #badge>
					<UiBadge tone="neutral">{{ t(item.type + 'Type') }}</UiBadge>
				</template>
				<template v-if="item.hasPassphrase" #tags>
					<span class="credentials-security">{{ t('protectedKey') }}</span>
				</template>
				<template #actions
					><UiButton
						appearance="ghost"
						tone="danger"
						icon-only
						:aria-label="t('delete') + ' · ' + item.name"
						@click="pending = item"
						><Trash2 :size="18" /></UiButton
				></template>
			</UiCard>
			<UiEmptyState
				v-if="loaded && !entries.length"
				:icon="KeyRound"
				:title="t(items.length ? 'noResults' : 'empty')"
				:description="items.length ? '' : t('emptyHint')"
			/>
		</div>
	</section>
	<CredentialEditor
		:view="view"
		v-if="editor"
		:runtime="runtime"
		:credential="editor.credential"
		@close="editor = undefined"
	/>
	<UiDialog
		:open="!!pending"
		:close-disabled="deleting"
		:title="t('deleteTitle')"
		:description="pending ? t('deleteHint', { name: pending.name }) : ''"
		:close-label="t('close')"
		@update:open="(value) => !value && (pending = undefined)"
		><template #footer
			><UiButton :disabled="deleting" @click="pending = undefined">{{ t('cancel') }}</UiButton
			><UiButton tone="danger" :loading="deleting" loading-animation="spinner" @click="remove"
				><template #leading><Trash2 :size="16" /></template>{{ t('delete') }}</UiButton
			></template
		></UiDialog
	>
</template>
