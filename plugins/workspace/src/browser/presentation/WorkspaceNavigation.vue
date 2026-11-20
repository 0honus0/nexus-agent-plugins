<script setup lang="ts">
	import { UiButton, UiDropdownMenu } from 'nexus-terminal/browser/ui';
	import type { NavigationItem, PresentationProfile } from './presentation-types';
	defineProps<{
		items: NavigationItem[];
		config: PresentationProfile['navigation'];
		label: string;
	}>();
</script>
<template>
	<nav class="workspace-navigation" :data-placement="config.placement" :aria-label="label">
		<template v-for="item in items" :key="item.id">
			<UiDropdownMenu
				v-if="item.items"
				:items="item.items"
				:disabled="item.disabled"
				@select="item.select?.($event)"
			>
				<UiButton
					appearance="ghost"
					:icon-only="config.display === 'icon'"
					:aria-label="item.label"
					:title="item.label"
					:disabled="item.disabled"
					><component :is="item.icon" :size="18" /><span v-if="config.display === 'icon-label'">{{
						item.label
					}}</span></UiButton
				>
			</UiDropdownMenu>
			<UiButton
				v-else
				appearance="ghost"
				:icon-only="config.display === 'icon'"
				:aria-label="item.label"
				:title="item.label"
				:aria-pressed="item.active"
				:disabled="item.disabled"
				:loading="item.loading"
				@click="item.run"
				><component :is="item.icon" :size="18" /><span v-if="config.display === 'icon-label'">{{
					item.label
				}}</span></UiButton
			>
		</template>
	</nav>
</template>
