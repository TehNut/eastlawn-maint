<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	let {
		title,
		back,
		actions
	}: { title: string | Promise<string>; back?: string; actions?: Snippet } = $props();
</script>

<header
	class="sticky top-0 z-20 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur"
	style="view-transition-name: page-header"
>
	<div class="flex h-14 items-center gap-1 px-2 md:px-4">
		{#if back}
			<a
				href={back}
				aria-label="Back"
				class="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-muted"
			>
				<ChevronLeft class="size-6" />
			</a>
		{/if}
		<h1 class="min-w-0 flex-1 truncate text-lg font-semibold {back ? '' : 'pl-2'}">
			<!-- A detail page's name streams in with its data. -->
			{#await title then text}{text}{/await}
		</h1>
		{@render actions?.()}
	</div>
</header>
