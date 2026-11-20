<script setup lang="ts">
	import { computed, ref } from 'vue';
	import { Link } from '@lucide/vue';
	import manifest, { inlineIcons } from 'virtual:workspace-file-icons';
	const props = defineProps<{ name: string; kind: string }>();
	const loaded = ref('');
	const fallback = computed(() => iconFile(props.kind === 'directory' ? manifest.folder : manifest.file));
	const file = computed(() => {
		const name = props.name.toLowerCase();
		const suffixes = name.split('.').map((_, index, parts) => parts.slice(index).join('.'));
		const id =
			props.kind === 'directory'
				? (manifest.folderNames?.[name] ?? manifest.folder)
				: (manifest.fileNames?.[name] ??
					suffixes.map((ext) => manifest.fileExtensions?.[ext]).find(Boolean) ??
					manifest.file);
		return iconFile(id);
	});
	const embedded = computed(() => inlineIcons[file.value]);
	const external = computed(() => new URL('assets/file-icons/' + file.value, import.meta.url).href);

	function iconFile(id?: string): string {
		return (id && manifest.iconDefinitions?.[id]?.iconPath.split('/').pop()) || 'file.svg';
	}

	function showIcon(event: Event): void {
		loaded.value = (event.currentTarget as HTMLImageElement).src;
	}
</script>
<template>
	<span class="workspace-file-icon">
		<img v-if="embedded || loaded !== external" :src="embedded ?? inlineIcons[fallback]" alt="" />
		<img
			v-if="!embedded"
			:src="external"
			alt=""
			loading="lazy"
			decoding="async"
			class="workspace-file-icon-detail"
			:class="{ 'is-loaded': loaded === external }"
			@load="showIcon"
		/>
		<Link v-if="kind === 'link'" :size="9" />
	</span>
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
	.workspace-file-icon-detail {
		position: absolute;
		inset: 0;
		visibility: hidden;
	}
	.workspace-file-icon-detail.is-loaded {
		visibility: visible;
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
