<script setup lang="ts">
	import { Fingerprint, Plus, Trash2 } from '@lucide/vue';
	import type { PluginWindowProps } from 'nexus-terminal/browser';
	import { UiButton, UiDialog, UiEmptyState, UiList, UiListItem } from 'nexus-terminal/browser/ui';
	import { onMounted, ref } from 'vue';
	import { useI18n } from 'vue-i18n';
	import { PasskeyListSchema, type Passkey } from '../shared/passkey-http-types.js';
	import { messages } from './messages.js';
	import { passkeysSupported, registerPasskey, reportPasskeyFailure } from './passkey-client-api.js';
	import { z } from 'zod';

	const { context, view } = defineProps<PluginWindowProps>();
	const { t } = useI18n({ useScope: 'local', messages });
	const items = ref<Passkey[]>();
	const adding = ref(false);
	const removing = ref(false);
	const selected = ref<Passkey>();
	const supported = passkeysSupported();

	onMounted(async () => {
		try {
			const result = await context.app.http.json('/passkeys', PasskeyListSchema, { signal: view.signal });
			items.value = result.items;
		} catch (cause) {
			reportPasskeyFailure(context, cause, view.signal);
		}
	});

	async function add() {
		if (!items.value || adding.value || removing.value) return;
		adding.value = true;
		try {
			const item = await context.app.tasks.run((signal) => registerPasskey(context, signal), {
				view,
			});
			view.signal.throwIfAborted();
			items.value = [...items.value, item];
			context.app.log.report({ level: 'info', code: 'PASSKEY_ADDED', userVisible: true });
		} catch (cause) {
			reportPasskeyFailure(context, cause, view.signal);
		} finally {
			adding.value = false;
		}
	}

	async function remove() {
		const item = selected.value;
		if (!item || !items.value || removing.value || adding.value) return;
		removing.value = true;
		try {
			await context.app.tasks.run(
				(signal) =>
					context.app.http.json('/passkeys/' + encodeURIComponent(item.id), z.undefined(), {
						signal,
						method: 'DELETE',
					}),
				{ view },
			);
			view.signal.throwIfAborted();
			items.value = items.value.filter(({ id }) => id !== item.id);
			selected.value = undefined;
			context.app.log.report({ level: 'info', code: 'PASSKEY_REMOVED', userVisible: true });
		} catch (cause) {
			reportPasskeyFailure(context, cause, view.signal);
		} finally {
			removing.value = false;
		}
	}
</script>

<template>
	<section class="passkey-app">
		<UiButton
			class="passkey-add"
			tone="primary"
			:loading="adding"
			:disabled="!items || !supported || removing"
			@click="add"
		>
			<Plus :size="16" />{{ t('add') }}
		</UiButton>
		<p v-if="!supported" class="passkey-hint">{{ t('secureOrigin') }}</p>
		<UiList v-if="items?.length">
			<UiListItem
				v-for="item in items"
				:key="item.id"
				:title="item.name || t('defaultName')"
				:description="item.origin"
				:icon="Fingerprint"
			>
				<template #actions>
					<UiButton
						icon-only
						appearance="ghost"
						tone="danger"
						:aria-label="t('remove') + ' · ' + (item.name || t('defaultName'))"
						:disabled="adding || removing"
						@click="selected = item"
					>
						<Trash2 :size="16" />
					</UiButton>
				</template>
			</UiListItem>
		</UiList>
		<UiEmptyState v-else-if="items" :icon="Fingerprint" :title="t('empty')" />
		<UiDialog
			:open="!!selected"
			:title="t('removeTitle')"
			:close-label="t('cancel')"
			@update:open="!$event && (selected = undefined)"
		>
			<p>{{ selected?.name || t('defaultName') }}</p>
			<template #footer>
				<UiButton :disabled="removing" @click="selected = undefined">{{ t('cancel') }}</UiButton>
				<UiButton tone="danger" :loading="removing" @click="remove">{{ t('remove') }}</UiButton>
			</template>
		</UiDialog>
	</section>
</template>

<style scoped>
	.passkey-app {
		display: grid;
		gap: 18px;
		padding: 22px;
	}
	.passkey-add {
		justify-self: start;
	}
	.passkey-hint {
		margin: 0;
		color: var(--ui-muted);
	}
</style>
