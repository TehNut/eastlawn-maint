<script lang="ts">
	import ChatHistory from '$lib/components/app/ChatHistory.svelte';
	import ChatPanel from '$lib/components/app/ChatPanel.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';

	let { data } = $props();
</script>

<div class="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] flex-col md:h-dvh">
	<PageHeader title="Assistant">
		{#snippet actions()}
			<ChatHistory chats={data.chats} current={data.chat?.id ?? null} href="/chat" />
		{/snippet}
	</PageHeader>
	<ChatPanel
		endpoint="/api/chat"
		chat={data.chat}
		intro="Ask about your equipment or how to use the app. It can look things up, and with permission propose changes for you to approve."
		starters={[
			// Questions that need manuals or reasoning across logs, which no single page shows.
			'Help me troubleshoot something that won’t start',
			'Is anything breaking down over and over?',
			'What should I check on a machine before using it?'
		]}
	/>
</div>
