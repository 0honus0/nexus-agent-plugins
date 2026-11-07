<script setup lang="ts">
	import { useAgentChatUiPlatform } from '@/features/agent/chat-ui/platform';
	import AgentAppSurface from '@/features/agent/views/AgentAppSurface.vue';
	const { environment } = useAgentChatUiPlatform();
</script>
<template>
	<AgentAppSurface
		:app-id="environment.appId"
		:app-version="environment.appVersion"
		:active="environment.active"
		:execution-enabled="environment.executionEnabled"
		:resume-revision="environment.resumeRevision"
	/>
</template>
