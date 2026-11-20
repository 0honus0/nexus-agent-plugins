<script setup lang="ts">
	import { Keyboard, Trash2 } from '@lucide/vue';
	import { UiField, UiSelect, UiSwitch } from 'nexus-terminal/browser/ui';
	import { LocalEchoModeSchema } from '../../shared/workspace-catalog-types';
	import { useWorkspaceCatalog } from '../catalog/workspace-catalog';
	import type { WorkspaceI18n } from '../workspace-i18n';
	defineProps<{ i18n: WorkspaceI18n }>();
	const catalog = useWorkspaceCatalog();
</script>
<template>
	<div class="workspace-tool-panel workspace-general-panel">
		<section class="workspace-general-section">
			<header class="workspace-tool-heading">
				<span class="workspace-library-symbol"><Keyboard :size="20" /></span>
				<div>
					<h4>{{ i18n.t('general.localEcho') }}</h4>
					<p>{{ i18n.t('general.hint') }}</p>
				</div>
			</header>
			<UiField :label="i18n.t('general.echoMode')">
				<UiSelect
					:model-value="catalog.state.value.preferences.localEcho"
					:aria-label="i18n.t('general.localEcho')"
					:disabled="!catalog.loaded.value"
					:options="
						LocalEchoModeSchema.options.map((value) => ({ value, label: i18n.t('general.' + value) }))
					"
					@update:model-value="catalog.preferences({ localEcho: LocalEchoModeSchema.parse($event) })"
				/>
			</UiField>
		</section>
		<section class="workspace-general-section">
			<header class="workspace-tool-heading">
				<span class="workspace-library-symbol"><Trash2 :size="20" /></span>
				<div>
					<h4>{{ i18n.t('general.files') }}</h4>
					<p>{{ i18n.t('general.deletionHint') }}</p>
				</div>
			</header>
			<label class="workspace-display-toggle">
				<span>{{ i18n.t('general.confirmFileDeletion') }}</span>
				<UiSwitch
					:model-value="catalog.state.value.preferences.confirmFileDeletion"
					:aria-label="i18n.t('general.confirmFileDeletion')"
					:disabled="!catalog.loaded.value"
					@update:model-value="catalog.preferences({ confirmFileDeletion: $event })"
				/>
			</label>
		</section>
	</div>
</template>
<style scoped>
	.workspace-general-section {
		display: grid;
		gap: 16px;
	}
	.workspace-general-section h4 {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.workspace-general-section + .workspace-general-section {
		padding-block-start: 22px;
		border-block-start: 1px solid var(--ui-border);
	}
</style>
