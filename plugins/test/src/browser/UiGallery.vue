<script setup lang="ts">
	import type { PluginComponentProps } from 'nexus-terminal/browser';
	import {
		UiActionCard,
		UiBadge,
		UiButton,
		UiCard,
		UiContextMenu,
		UiDialog,
		UiDropdownMenu,
		UiEmptyState,
		UiErrorCode,
		UiErrorCodeSchema,
		UiField,
		UiFormRow,
		UiInput,
		UiList,
		UiListItem,
		UiProgress,
		UiProgressRow,
		UiResizeHandle,
		UiScrollArea,
		UiSection,
		UiSelect,
		UiSlider,
		UiSwitch,
		UiTabs,
		UiToastStack,
		UiToolbar,
		UiTransition,
		uiResizeEdges,
		vSelectableAction,
		type UiMenuItem,
		type UiSelectOption,
		type UiTab,
		type UiToastItem,
	} from 'nexus-terminal/browser/ui';
	import { ref } from 'vue';

	defineProps<PluginComponentProps>();

	const options: UiSelectOption[] = [
		{ value: 'a', label: 'Alpha' },
		{ value: 'b', label: 'Beta' },
	];
	const tabs: UiTab[] = [
		{ value: 'a', label: 'Gallery first' },
		{ value: 'b', label: 'Gallery second' },
	];
	const menu: UiMenuItem[] = [{ id: 'selected', label: 'Select gallery action' }];
	const toast: UiToastItem = { id: 1, tone: 'success', message: 'Gallery notification' };
	const tab = ref('a');
	const input = ref('');
	const selected = ref('a');
	const switched = ref(false);
	const progress = ref(25);
	const dialog = ref(false);
	const result = ref('');
	const showToast = ref(false);
	const showTransition = ref(false);
	const uiError = UiErrorCodeSchema.parse(UiErrorCode.UI_THEME_UNAVAILABLE);

	function resize(width: number, height: number): void {
		result.value = `resize:${width}:${height}`;
	}
</script>

<template>
	<UiScrollArea>
		<UiSection title="SDK UI coverage" collapsible>
			<UiToolbar>
				<UiBadge tone="success">Gallery badge</UiBadge>
				<template #actions>
					<UiButton @click="showToast = true">Show gallery toast</UiButton>
					<UiButton @click="showTransition = !showTransition">Toggle gallery transition</UiButton>
				</template>
			</UiToolbar>
			<UiTransition preset="fade"><p v-if="showTransition">Gallery transition content</p></UiTransition>
			<UiField label="Gallery input" v-slot="field">
				<UiInput :id="field.id" v-model="input" />
			</UiField>
			<UiFormRow label="Gallery switch" v-slot="field">
				<UiSwitch :id="field.id" v-model="switched" />
			</UiFormRow>
			<UiSelect v-model="selected" aria-label="Gallery choice" :options="options" />
			<UiSlider v-model="progress" aria-label="Gallery slider" :min="0" :max="100" :step="5" />
			<UiProgress :value="progress" label="Gallery progress" />
			<UiProgressRow :value="progress" label="Gallery transfer" state="running" status-label="Transferring" />
			<UiTabs v-model="tab" :options="tabs" label="Gallery tabs">
				<template #a><UiEmptyState title="Gallery empty state" /></template>
				<template #b
					><UiList><UiListItem title="Gallery list item" /></UiList
				></template>
			</UiTabs>
			<UiCard title="Gallery card" action-label="Gallery card" @select="result = 'card'">
				<template #actions>
					<UiDropdownMenu :items="menu" @select="result = $event">
						<UiButton>Gallery dropdown</UiButton>
					</UiDropdownMenu>
				</template>
			</UiCard>
			<UiContextMenu :items="menu" @select="result = 'context:' + $event">
				<UiButton v-selectable-action>Gallery context menu</UiButton>
			</UiContextMenu>
			<UiActionCard label="Open gallery dialog" @click="dialog = true">Gallery action card</UiActionCard>
			<UiDialog v-model:open="dialog" title="Gallery dialog" close-label="Close gallery dialog">
				<p>{{ uiError }}</p>
			</UiDialog>
			<div style="position: relative; width: 8rem; height: 2rem">
				<UiResizeHandle label="Gallery resize" edges @resize="resize" />
			</div>
			<p data-testid="sdk-ui-edges">{{ Object.keys(uiResizeEdges).length }}</p>
			<p data-testid="sdk-ui-state">{{ [input, selected, switched, tab].join(' ') }}</p>
			<p data-testid="sdk-ui-result">{{ result }}</p>
		</UiSection>
		<UiToastStack
			:items="showToast ? [toast] : []"
			label="Gallery notices"
			close-label="Dismiss gallery toast"
			expand-label="Expand gallery toast"
			collapse-label="Collapse gallery toast"
			:position-label="(position, total) => position + ' / ' + total"
			:duration="Infinity"
			@dismiss="showToast = false"
		/>
	</UiScrollArea>
</template>
