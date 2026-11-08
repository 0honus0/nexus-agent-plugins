<script setup lang="ts" generic="T extends object">
	import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
	import { connectNexusPlugin } from 'nexus:frontend-sdk';
	import type { AgentPluginFrontendSdk } from '@nexus-terminal/shared/agent/plugins/frontend-sdk';
	import type {
		AgentPluginInstanceSettings,
		AgentPluginConfigurationWrite,
	} from '@nexus-terminal/shared/agent/plugins/settings';
	import type { AgentPluginUiEnvironment } from '@nexus-terminal/shared/agent/plugins/ui-events';
	import { UiButton, UiInlineNotice, UiLoadingState } from './foundation/ui';

	const props = defineProps<{ decode(documentJson: string): T }>();
	const draft = shallowRef<T | null>(null);
	const source = shallowRef<AgentPluginInstanceSettings | null>(null);
	const locale = ref('en-US');
	const loading = ref(true);
	const busy = ref(false);
	const failure = ref(false);
	const saved = ref(false);
	const pending = shallowRef<AgentPluginConfigurationWrite | null>(null);
	const stop = new AbortController();
	let sdk: AgentPluginFrontendSdk | null = null;
	let unsubscribe: (() => void) | null = null;
	const labels = computed(() =>
		locale.value === 'zh-CN'
			? {
					loading: '正在读取设置',
					save: '保存',
					retry: '重试原操作',
					reload: '重新读取',
					failed: '设置未能确认，请重新读取或重试原操作。',
					saved: '已保存',
				}
			: locale.value === 'ja-JP'
				? {
						loading: '設定を読み込み中',
						save: '保存',
						retry: '元の操作を再試行',
						reload: '再読み込み',
						failed: '設定を確認できません。再読み込みするか、元の操作を再試行してください。',
						saved: '保存しました',
					}
				: {
						loading: 'Loading settings',
						save: 'Save',
						retry: 'Retry original operation',
						reload: 'Reload',
						failed: 'Settings could not be confirmed. Reload or retry the original operation.',
						saved: 'Saved',
					},
	);

	function environment(value: AgentPluginUiEnvironment): void {
		locale.value = value.locale;
		document.documentElement.lang = value.locale;
		document.documentElement.classList.toggle('dark', value.dark);
		for (const variable of value.themeVariables) {
			document.documentElement.style.setProperty(variable.name, variable.value);
		}
	}

	async function load(): Promise<void> {
		if (!sdk || pending.value || busy.value) {
			return;
		}
		loading.value = true;
		failure.value = false;
		try {
			const value = await sdk.settings.read(stop.signal);
			if (stop.signal.aborted) {
				return;
			}
			if (!value.settings) {
				throw new Error('PLUGIN_SETTINGS_MISSING');
			}
			const documentJson =
				value.configuration.revision === 0 ? value.settings.defaultsJson : value.configuration.documentJson;
			const document = props.decode(documentJson);
			source.value = value;
			draft.value = document;
		} catch {
			if (!stop.signal.aborted) {
				failure.value = true;
			}
		} finally {
			if (!stop.signal.aborted) {
				loading.value = false;
			}
		}
	}

	async function save(): Promise<void> {
		const current = source.value;
		if (!sdk || !current?.settings || !draft.value || busy.value) {
			return;
		}
		let command = pending.value;
		if (command === null) {
			try {
				command = {
					operationKey: crypto.randomUUID(),
					expectedPackageRevision: current.packageRevision,
					expectedRevision: current.configuration.revision,
					schemaRevision: current.settings.schemaRevision,
					documentJson: JSON.stringify(props.decode(JSON.stringify(draft.value))),
				};
			} catch {
				failure.value = true;
				return;
			}
		}
		pending.value = command;
		busy.value = true;
		failure.value = false;
		saved.value = false;
		try {
			const value = await sdk.settings.write(command, stop.signal);
			if (stop.signal.aborted) {
				return;
			}
			if (value.instanceId !== current.instance.id || value.revision !== command.expectedRevision + 1) {
				throw new Error('PLUGIN_SETTINGS_RECEIPT_INVALID');
			}
			source.value = {
				instance: current.instance,
				packageRevision: current.packageRevision,
				connectionKinds: current.connectionKinds,
				settings: current.settings,
				configuration: value,
			};
			pending.value = null;
			saved.value = true;
		} catch (error) {
			if (!stop.signal.aborted) {
				failure.value = true;
				if (error instanceof Error && 'outcomeUnknown' in error && error.outcomeUnknown === false) {
					pending.value = null;
				}
			}
		} finally {
			if (!stop.signal.aborted) {
				busy.value = false;
			}
		}
	}

	onMounted(async () => {
		try {
			const connected = await connectNexusPlugin();
			if (stop.signal.aborted) {
				await connected.close();
				return;
			}
			sdk = connected;
			unsubscribe = connected.ui.onEnvironment(environment);
			const ready = await connected.ui.ready;
			if (stop.signal.aborted) {
				return;
			}
			environment(ready);
			await load();
		} catch {
			if (!stop.signal.aborted) {
				loading.value = false;
				failure.value = true;
			}
		}
	});
	onBeforeUnmount(() => {
		stop.abort();
		unsubscribe?.();
		void sdk?.close().catch(() => console.error('Plugin Settings Surface cleanup failed'));
	});
</script>

<template>
	<form class="space-y-5 px-1 py-2" @submit.prevent="save">
		<UiLoadingState v-if="loading" compact :title="labels.loading" />
		<template v-else>
			<UiInlineNotice v-if="failure" compact tone="warning">{{ labels.failed }}</UiInlineNotice>
			<UiInlineNotice v-else-if="saved" compact tone="success">{{ labels.saved }}</UiInlineNotice>
			<fieldset v-if="source && draft" :disabled="busy || pending !== null" class="min-w-0 space-y-5">
				<slot
					:draft="draft"
					:update-draft="(value: T) => (draft = value)"
					:locale="locale"
					:disabled="busy || pending !== null"
				/>
			</fieldset>
			<div class="flex justify-end gap-2">
				<UiButton v-if="!pending" type="button" :disabled="busy" @click="load">{{ labels.reload }}</UiButton>
				<UiButton v-if="source" type="submit" appearance="solid" tone="primary" :loading="busy">{{
					pending ? labels.retry : labels.save
				}}</UiButton>
			</div>
		</template>
	</form>
</template>
