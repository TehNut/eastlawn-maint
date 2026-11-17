<script lang="ts">
	import ClipboardPlus from '@lucide/svelte/icons/clipboard-plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { page } from '$app/state';
	import Loading from '$lib/components/app/Loading.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { can } from '$lib/permissions';
	import Details from './Details.svelte';

	let { data, form } = $props();
	const id = $derived(page.params.id);
</script>

<PageHeader title={data.page.then((p) => p.item.name).catch(() => '')} back="/">
	{#snippet actions()}
		{#if can(data.user, 'equipment.update') || can(data.user, 'equipment.delete')}
			<a
				href="/equipment/{id}/edit"
				aria-label="Edit"
				class="flex size-11 items-center justify-center rounded-full active:bg-muted"
			>
				<Pencil class="size-5" />
			</a>
		{/if}
	{/snippet}
</PageHeader>

<Loading data={data.page} id="equipment">
	{#snippet children(p)}
		<Details data={{ ...p, user: data.user }} {form} />
	{/snippet}
</Loading>

<!-- The page's main action on phones: logging work on this item. Labelled, since a bare + here
     could mean several things. From md it's the accent tile in the action row instead. -->
{#if can(data.user, 'log.create')}
	<a
		href="/equipment/{id}/logs/new"
		class="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex h-14 items-center gap-2 rounded-full bg-primary pr-6 pl-5 font-medium text-primary-foreground shadow-lg active:scale-95 md:hidden"
	>
		<ClipboardPlus class="size-5" />
		Add log
	</a>
{/if}
