<script lang="ts">
	import ChatPanel from '$lib/components/app/ChatPanel.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';

	let { data } = $props();
</script>

<div class="flex h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
	<PageHeader title="Ask about {data.item.name}" back="/equipment/{data.item.id}" />
	<ChatPanel
		endpoint="/api/ask"
		payload={{ equipmentId: data.item.id }}
		applyTo={data.item.id}
		pageHref={data.manualId
			? (page) => `/manuals/${data.manualId}?page=${page}&from=${data.item.id}`
			: undefined}
		intro="Answers use this item's details and maintenance history."
		starters={[
			'What routine maintenance does this need?',
			'What do its recent logs suggest?',
			'What are common failure points?'
		]}
	/>
</div>
