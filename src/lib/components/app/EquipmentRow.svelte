<script lang="ts">
	import Wrench from '@lucide/svelte/icons/wrench';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import DueBadge from './DueBadge.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import { CARD_LINK } from '$lib/utils';

	let {
		item
	}: {
		item: {
			id: string;
			name: string;
			status: string;
			locationName?: string | null;
			coverId: string | null;
			due?: 'due' | 'due_soon' | null;
		};
	} = $props();
</script>

<a href="/equipment/{item.id}" class="flex h-full items-center gap-3 p-3 {CARD_LINK}">
	<div
		class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted"
	>
		{#if item.coverId}
			<img src="/images/{item.coverId}" alt="" loading="lazy" class="size-full object-cover" />
		{:else}
			<Wrench class="size-5 text-muted-foreground" />
		{/if}
	</div>
	<div class="min-w-0 flex-1">
		<p class="truncate font-medium">{item.name}</p>
		{#if item.locationName}
			<p class="truncate text-sm text-muted-foreground">{item.locationName}</p>
		{/if}
		{#if item.due || item.status !== 'active'}
			<div class="mt-1 flex gap-1.5">
				{#if item.due}<DueBadge state={item.due} />{/if}
				<StatusBadge status={item.status} />
			</div>
		{/if}
	</div>
	<ChevronRight class="size-5 shrink-0 text-muted-foreground" />
</a>
