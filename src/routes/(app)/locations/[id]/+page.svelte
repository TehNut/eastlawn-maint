<script lang="ts">
	import ConfirmDelete from '$lib/components/app/ConfirmDelete.svelte';
	import Loading from '$lib/components/app/Loading.svelte';
	import EquipmentRow from '$lib/components/app/EquipmentRow.svelte';
	import LocationForm from '$lib/components/app/LocationForm.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CARD_LIST } from '$lib/utils';

	let { data, form } = $props();
</script>

<PageHeader title={data.page.then((p) => p.place.name).catch(() => '')} back="/locations" />
<Loading data={data.page} id="location">
	{#snippet children({ place, items })}
		<main class="mx-auto max-w-3xl space-y-6 py-4">
			<section>
				{#if items.length}
					<ul class={CARD_LIST}>
						{#each items as item (item.id)}
							<li><EquipmentRow {item} /></li>
						{/each}
					</ul>
				{:else}
					<p class="px-4 text-muted-foreground">No equipment here yet.</p>
				{/if}
				<div class="p-4">
					<Button variant="outline" class="h-11 w-full" href="/equipment/new?location={place.id}">
						Add equipment here
					</Button>
				</div>
			</section>
			<section class="space-y-4 px-4">
				<h2 class="font-semibold">Location details</h2>
				<LocationForm values={place} error={form?.error} submitLabel="Save changes" />
				<ConfirmDelete
					label="Delete location"
					description="This removes {place.name}. Locations with equipment can't be deleted."
				/>
			</section>
		</main>
	{/snippet}
</Loading>
