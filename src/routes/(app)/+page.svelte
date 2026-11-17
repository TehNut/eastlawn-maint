<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { goto } from '$app/navigation';
	import Loading from '$lib/components/app/Loading.svelte';
	import EquipmentRow from '$lib/components/app/EquipmentRow.svelte';
	import Pager from '$lib/components/app/Pager.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { Input } from '$lib/components/ui/input';
	import { STATUSES } from '$lib/constants';
	import { can } from '$lib/permissions';
	import { sampleEquipment } from '$lib/samples';
	import { CARD_GRID, WIDE_PAGE } from '$lib/utils';

	let { data } = $props();

	let filters = $state<HTMLFormElement>();
	let timer: ReturnType<typeof setTimeout>;

	function filter(form: HTMLFormElement, delay = 0) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not reactive state
			const params = new URLSearchParams();
			for (const [key, value] of new FormData(form)) if (value) params.set(key, String(value));
			const query = params.size ? `?${params}` : '/';
			goto(query, { keepFocus: true, noScroll: true, replaceState: true });
		}, delay);
	}
</script>

<PageHeader title="Equipment">
	{#snippet actions()}
		{#if data.locations.length && can(data.user, 'equipment.create')}
			<a
				href="/equipment/new"
				aria-label="Add equipment"
				class="flex size-11 items-center justify-center rounded-full active:bg-muted"
			>
				<Plus class="size-6" />
			</a>
		{/if}
	{/snippet}
</PageHeader>

<main class="mx-auto {WIDE_PAGE}">
	<form
		bind:this={filters}
		class="space-y-2 p-4 lg:flex lg:gap-2 lg:space-y-0"
		onsubmit={(e) => {
			e.preventDefault();
			filter(e.currentTarget);
		}}
	>
		<div class="relative lg:flex-1">
			<Search class="absolute top-3 left-3 size-5 text-muted-foreground" />
			<Input
				type="search"
				name="q"
				value={data.q}
				placeholder="Name, model or serial"
				aria-label="Search equipment"
				class="pl-10"
				oninput={(e) => filter(e.currentTarget.form!, 250)}
			/>
		</div>
		<div class="grid gap-2 lg:w-md {data.user.locationId ? '' : 'grid-cols-2'}">
			{#if !data.user.locationId}
				<SelectField
					name="location"
					aria-label="Filter by location"
					options={[
						{ value: '', label: 'All locations' },
						...data.locations.map((l) => ({ value: l.id, label: l.name }))
					]}
					value={data.locationId}
					onchange={() => filter(filters!)}
				/>
			{/if}
			<SelectField
				name="status"
				aria-label="Filter by status"
				options={[{ value: '', label: 'Any status' }, ...STATUSES]}
				value={data.status}
				onchange={() => filter(filters!)}
			/>
		</div>
	</form>

	<Loading
		data={data.list}
		id="equipment-list"
		sample={{ items: sampleEquipment(), next: null, prev: null }}
	>
		{#snippet children(list)}
			{#if list.items.length}
				<ul class="pb-4 {CARD_GRID}">
					{#each list.items as item (item.id)}
						<li><EquipmentRow {item} /></li>
					{/each}
				</ul>
				<Pager next={list.next} prev={list.prev} />
			{:else if data.locations.length === 0}
				<div class="p-8 text-center text-muted-foreground">
					{#if can(data.user, 'admin')}
						<p>Start by adding a location.</p>
						<a
							href="/locations/new"
							class="mt-2 inline-block font-medium text-foreground underline"
						>
							Add location
						</a>
					{:else}
						<p>No equipment yet.</p>
					{/if}
				</div>
			{:else}
				<p class="p-8 text-center text-muted-foreground">No equipment found.</p>
				<Pager next={list.next} prev={list.prev} />
			{/if}
		{/snippet}
	</Loading>
</main>
