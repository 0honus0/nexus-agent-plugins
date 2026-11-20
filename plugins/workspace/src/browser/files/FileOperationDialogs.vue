<script setup lang="ts">
	import { computed } from 'vue';
	import { Folder, ChevronUp, Search } from '@lucide/vue';
	import { UiButton, UiDialog, UiInput, UiField, UiSelect } from 'nexus-terminal/browser/ui';
	import type { WorkspaceI18n } from '../workspace-i18n';
	import type { FileOperations } from './use-file-operations';
	const props = defineProps<{
		operations: FileOperations;
		busy: boolean;
		i18n: WorkspaceI18n;
		sessionId: string;
	}>();
	const { t } = props.i18n;
	const s = props.operations.state;
	const title = computed(() =>
		t(
			['mkdir', 'file', 'rename', 'remove'].includes(s.kind ?? '')
				? s.kind!
				: 'filesMenu.' + (s.kind ?? 'permissions'),
		),
	);
	const rows = ['owner', 'group', 'others'] as const,
		columns = ['read', 'write', 'execute'] as const;
	const mode = computed(() => parseInt(s.mode, 8) || 0);

	function toggle(bit: number) {
		s.mode = (mode.value ^ bit).toString(8).padStart(3, '0');
	}
</script>
<template>
	<UiDialog
		:open="!!s.kind && !s.overwrite"
		:title="title"
		:description="s.kind === 'remove' ? t('filesMenu.removeHint', { count: s.entries.length }) : undefined"
		:close-label="t('close')"
		:show-close="!busy"
		:close-on-escape="!busy"
		:close-on-interact-outside="!busy"
		@update:open="!$event && operations.close()"
	>
		<form
			v-if="s.kind !== 'remove'"
			:id="'file-operation-' + sessionId"
			class="workspace-file-dialog"
			@submit.prevent="operations.save()"
		>
			<UiField v-if="s.kind === 'compress'" :label="t('filesMenu.format')" v-slot="field"
				><UiSelect
					:id="field.id"
					:model-value="s.encrypted ? 'encrypted-zip' : s.format"
					:disabled="busy"
					:options="[
						{ value: 'zip', label: 'ZIP' },
						{ value: 'encrypted-zip', label: t('filesMenu.encryptedZip') },
						{ value: 'tar.gz', label: 'tar.gz' },
						{ value: 'tar.bz2', label: 'tar.bz2' },
					]"
					@update:model-value="operations.setFormat($event)"
			/></UiField>

			<UiField
				v-if="['mkdir', 'file', 'rename', 'compress'].includes(s.kind ?? '')"
				:label="t('fileName')"
				v-slot="field"
				><UiInput v-model="s.name" :id="field.id" :disabled="busy" autofocus
			/></UiField>
			<template v-if="s.kind === 'permissions'">
				<UiField :label="t('filesMenu.mode')" v-slot="field"
					><UiInput v-model="s.mode" :id="field.id" :disabled="busy" inputmode="numeric" maxlength="4"
				/></UiField>
				<div class="workspace-permissions">
					<span></span><span v-for="column in columns" :key="column">{{ t('filesMenu.' + column) }}</span
					><template v-for="(row, index) in rows" :key="row"
						><span>{{ t('filesMenu.' + row) }}</span
						><label v-for="(column, col) in columns" :key="column"
							><input
								type="checkbox"
								:id="'file-permission-' + sessionId + '-' + row + '-' + column"
								:aria-label="t('filesMenu.' + row) + ' ' + t('filesMenu.' + column)"
								:disabled="busy"
								:checked="!!(mode & (1 << ((2 - index) * 3 + 2 - col)))"
								@change="toggle(1 << ((2 - index) * 3 + 2 - col))" /></label
					></template>
				</div>
			</template>
			<UiField v-if="s.kind === 'send'" :label="t('filesMenu.server')" v-slot="field"
				><UiSelect
					v-model="s.server"
					:id="field.id"
					:options="operations.servers.value"
					:disabled="busy"
					@update:model-value="s.browsing = false"
			/></UiField>
			<UiButton
				v-if="s.kind === 'send' && s.server && !operations.destinationSession.value"
				:disabled="busy"
				@click="operations.connect()"
				>{{ t('filesMenu.connect') }}</UiButton
			>
			<template v-if="s.kind === 'extract' || s.kind === 'send'">
				<UiField :label="t('filesMenu.destination')" v-slot="field"
					><div class="workspace-directory-input">
						<UiInput v-model="s.destination" :id="field.id" :disabled="busy" /><UiButton
							:aria-label="t('filesMenu.browse')"
							:loading="s.reading"
							:disabled="busy || (s.kind === 'send' && !operations.destinationSession.value)"
							@click="operations.browse()"
							><Search :size="16"
						/></UiButton></div
				></UiField>
				<div v-if="s.browsing" class="workspace-directory-picker">
					<UiButton
						appearance="ghost"
						:disabled="busy || s.reading || s.destination === '/'"
						@click="operations.browse(s.destination.replace(/\/[^/]+\/?$/, '') || '/')"
						><ChevronUp :size="16" />..</UiButton
					><UiButton
						v-for="entry in s.directories"
						:key="entry.path"
						appearance="ghost"
						:disabled="busy || s.reading"
						@click="operations.browse(entry.path)"
						><Folder :size="16" />{{ entry.name }}</UiButton
					>
				</div>
			</template>
			<UiField
				v-if="s.kind === 'extract' || (s.kind === 'compress' && s.encrypted)"
				:label="t('filesMenu.password')"
				v-slot="field"
				><UiInput v-model="s.password" :id="field.id" type="password" autocomplete="off" :disabled="busy"
			/></UiField>
		</form>
		<template #footer
			><UiButton :disabled="busy" @click="operations.close()">{{ t('cancel') }}</UiButton
			><UiButton
				:tone="s.kind === 'remove' ? 'danger' : 'primary'"
				:loading="busy"
				:disabled="!operations.valid.value"
				@click="operations.save()"
				>{{ t(s.kind === 'remove' ? 'remove' : 'save') }}</UiButton
			></template
		>
	</UiDialog>
	<UiDialog
		:open="s.overwrite"
		:title="t('filesMenu.overwrite')"
		:description="t('filesMenu.overwriteHint')"
		:close-label="t('cancel')"
		:show-close="!busy"
		:close-on-escape="!busy"
		:close-on-interact-outside="!busy"
		@update:open="!$event && !busy && (s.overwrite = false)"
		><template #footer
			><UiButton :disabled="busy" @click="s.overwrite = false">{{ t('cancel') }}</UiButton
			><UiButton tone="danger" :loading="busy" @click="operations.confirmOverwrite()">{{
				t('continue')
			}}</UiButton></template
		></UiDialog
	>
</template>
<style scoped>
	.workspace-file-dialog {
		display: grid;
		gap: 16px;
	}
	.workspace-permissions {
		display: grid;
		grid-template-columns: 1.4fr repeat(3, 1fr);
		gap: 12px;
		text-align: center;
		font-size: 12px;
	}
	.workspace-permissions > span:nth-child(4n + 1) {
		text-align: start;
	}
	.workspace-permissions input {
		accent-color: var(--ui-primary);
	}
	.workspace-directory-input {
		display: flex;
		gap: 6px;
	}
	.workspace-directory-input :deep(.ui-input) {
		flex: 1;
		min-width: 0;
	}
	.workspace-directory-picker {
		display: flex;
		flex-direction: column;
		max-height: 220px;
		overflow: auto;
		border: 1px solid var(--ui-border);
		border-radius: 10px;
		padding: 4px;
	}
	.workspace-directory-picker .ui-button {
		justify-content: flex-start;
	}
</style>
