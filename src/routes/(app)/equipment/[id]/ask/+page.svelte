<script lang="ts">
	import ChatHistory from '$lib/components/app/ChatHistory.svelte';
	import ChatPanel from '$lib/components/app/ChatPanel.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';

	let { data } = $props();
</script>

<div class="flex h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
	<PageHeader title="Ask about {data.item.name}" back="/equipment/{data.item.id}">
		{#snippet actions()}
			<ChatHistory
				chats={data.chats}
				current={data.chat?.id ?? null}
				href="/equipment/{data.item.id}/ask"
			/>
		{/snippet}
	</PageHeader>
	<ChatPanel
		endpoint="/api/ask"
		payload={{ equipmentId: data.item.id }}
		applyTo={data.item.id}
		chat={data.chat}
		intro="Answers use this item's details and maintenance history."
		starters={[
			'What routine maintenance does this need?',
			'What do its recent logs suggest?',
			'What are common failure points?'
		]}
	/>
</div>
