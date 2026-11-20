<script setup lang="ts">
	import { computed } from 'vue';
	import { Link } from '@lucide/vue';
	import manifest from 'virtual:workspace-file-icons';
	const props = defineProps<{ name: string; kind: string }>();
	const src = computed(() => {
		const name = props.name.toLowerCase();
		const suffixes = name.split('.').map((_, index, parts) => parts.slice(index).join('.'));
		const id =
			props.kind === 'directory'
				? (manifest.folderNames?.[name] ?? manifest.folder)
				: (manifest.fileNames?.[name] ??
					suffixes.map((ext) => manifest.fileExtensions?.[ext]).find(Boolean) ??
					manifest.file);
		const file = manifest.iconDefinitions?.[id!]?.iconPath.split('/').pop() ?? 'file.svg';
		const location = 'assets/file-icons/' + file;
		return new URL(location, import.meta.url).href;
	});
</script>
<template>
	<span class="workspace-file-icon"
		><img :src="src" alt="" loading="lazy" /><Link v-if="kind === 'link'" :size="9"
	/></span>
</template>
<style scoped>
	.workspace-file-icon {
		position: relative;
		display: inline-flex;
		width: 20px;
		height: 20px;
		flex: none;
	}
	img {
		width: 100%;
		height: 100%;
	}
	svg {
		position: absolute;
		right: -3px;
		bottom: -3px;
		color: var(--ui-muted);
		background: var(--ui-surface);
		border-radius: 3px;
	}
</style>
