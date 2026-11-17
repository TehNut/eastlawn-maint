<script lang="ts">
	import { goto } from '$app/navigation';
	import Loading from '$lib/components/app/Loading.svelte';
	import LogItem from '$lib/components/app/LogItem.svelte';
	import Pager from '$lib/components/app/Pager.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { LOG_TYPES, logTypeLabel } from '$lib/constants';
	import { sampleLogs } from '$lib/samples';
	import { CARD_LIST } from '$lib/utils';

	let { data } = $props();

	// Both filters live in the URL, so each keeps the other.
	function query(next: { location?: string; type?: string }) {
		const { location = data.locationId, type = data.type } = next;
		const params = [
			location && `location=${encodeURIComponent(location)}`,
			type && `type=${type}`
		].filter(Boolean);
		return params.length ? `?${params.join('&')}` : '/activity';
	}
	const filterLocation = (location: string) =>
		goto(query({ location }), { keepFocus: true, noScroll: true, replaceState: true });

	const emptyText = $derived(
		`No ${data.type ? logTypeLabel(data.type).toLowerCase() + ' logs' : 'maintenance logged'}${
			data.locationId ? ' at this location' : ''
		} yet.`
	);
</script>

<PageHeader title="Activity" />
<main class="mx-auto max-w-3xl">
	<div class="space-y-2 p-4">
		<nav
			aria-label="Filter by type"
			class="grid grid-cols-5 rounded-lg bg-muted p-1 text-xs font-medium sm:text-sm"
		>
			{#each [{ value: '', label: 'All' }, ...LOG_TYPES] as t (t.value)}
				<a
					href={query({ type: t.value })}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={data.type === t.value ? 'page' : undefined}
					title={t.label}
					class="truncate rounded-md px-1 py-1.5 text-center {data.type === t.value
						? 'bg-background shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{t.label}
				</a>
			{/each}
		</nav>
		{#if !data.user.locationId}
			<SelectField
				aria-label="Filter by location"
				options={[
					{ value: '', label: 'All locations' },
					...data.locations.map((l) => ({ value: l.id, label: l.name }))
				]}
				value={data.locationId}
				onchange={filterLocation}
			/>
		{/if}
	</div>
	<Loading data={data.list} id="activity" sample={{ logs: sampleLogs(), next: null, prev: null }}>
		{#snippet children(list)}
			{#if list.logs.length}
				<div class="pb-4 {CARD_LIST}">
					{#each list.logs as log (log.id)}
						<LogItem {log} equipmentName={log.equipment.name} />
					{/each}
				</div>
			{:else}
				<p class="p-8 text-center text-muted-foreground">{emptyText}</p>
			{/if}
			<Pager next={list.next} prev={list.prev} prevLabel="Newer" nextLabel="Older" />
		{/snippet}
	</Loading>
</main>
