<script lang="ts">
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import ChatPanel from '$lib/components/app/ChatPanel.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';

	let { data } = $props();
	let panel = $state<ChatPanel>();
</script>

<div class="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] flex-col md:h-dvh">
	<PageHeader title="Assistant">
		{#snippet actions()}
			<button
				type="button"
				aria-label="New chat"
				class="flex size-11 items-center justify-center rounded-full active:bg-muted"
				onclick={() => panel?.clear()}
			>
				<SquarePen class="size-5" />
			</button>
		{/snippet}
	</PageHeader>
	<ChatPanel
		bind:this={panel}
		endpoint="/api/chat"
		storageKey="chat:{data.user.id}"
		intro="Ask about your equipment or how to use the app. It can look things up but can't change anything."
		starters={[
			// Questions that need manuals or reasoning across logs, which no single page shows.
			'Help me troubleshoot something that won’t start',
			'Is anything breaking down over and over?',
			'What should I check on a machine before using it?'
		]}
	/>
</div>
