<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Loading from '$lib/components/app/Loading.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { CARD_LINK, CARD_LIST } from '$lib/utils';

	let { data } = $props();
</script>

<PageHeader title="Locations" back="/settings">
	{#snippet actions()}
		<a
			href="/locations/new"
			aria-label="Add location"
			class="flex size-11 items-center justify-center rounded-full active:bg-muted"
		>
			<Plus class="size-6" />
		</a>
	{/snippet}
</PageHeader>

<main class="mx-auto max-w-3xl">
	<Loading data={data.locations} id="locations">
		{#snippet children(locations)}
			{#if locations.length}
				<ul class="py-4 {CARD_LIST}">
					{#each locations as location (location.id)}
						<li>
							<a href="/locations/{location.id}" class="flex items-center gap-3 p-4 {CARD_LINK}">
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{location.name}</p>
									{#if location.address}
										<p class="truncate text-sm text-muted-foreground">{location.address}</p>
									{/if}
								</div>
								<span class="text-sm text-muted-foreground">{location.count}</span>
								<ChevronRight class="size-5 text-muted-foreground" />
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="p-8 text-center text-muted-foreground">No locations yet.</p>
			{/if}
		{/snippet}
	</Loading>
</main>
