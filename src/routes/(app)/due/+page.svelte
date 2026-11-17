<script lang="ts">
	import { goto } from '$app/navigation';
	import DueBadge from '$lib/components/app/DueBadge.svelte';
	import Loading from '$lib/components/app/Loading.svelte';
	import Pager from '$lib/components/app/Pager.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { CATEGORIES, formatDate, meterShort } from '$lib/constants';
	import { dueLabel } from '$lib/schedule';
	import { CARD_GRID, CARD_LINK, WIDE_PAGE } from '$lib/utils';

	let { data } = $props();

	const tiles = $derived([
		{ flag: 'due', label: 'Due', tone: 'text-destructive' },
		{ flag: 'due_soon', label: 'Due soon', tone: 'text-warn' },
		{ flag: 'no_history', label: 'No history', tone: '' },
		{ flag: 'up_to_date', label: 'Up to date', tone: 'text-muted-foreground' }
	] as const);

	const filtered = $derived(!!(data.locationId || data.category));
	const sample = {
		counts: { due: 0, due_soon: 0, no_history: 0, up_to_date: 0 },
		scheduled: 1,
		groups: [
			{
				...CATEGORIES[0],
				items: Array.from({ length: 6 }, (_, i) => ({
					id: `sample-${i}`,
					name: 'Equipment item name',
					locationName: 'Location name',
					meterUnit: null,
					reading: null,
					jobs: []
				}))
			}
		],
		next: null,
		prev: null
	};

	// All filters live in the URL, so each keeps the others.
	function query(next: { location?: string; category?: string; flag?: string }) {
		const { location = data.locationId, category = data.category, flag = data.flag } = next;
		const params = [
			location && `location=${encodeURIComponent(location)}`,
			category && `category=${category}`,
			flag && `flag=${flag}`
		].filter(Boolean);
		return params.length ? `?${params.join('&')}` : '/due';
	}
	const go = (location: string) =>
		goto(query({ location }), { keepFocus: true, noScroll: true, replaceState: true });
</script>

<!-- Rendered twice: in the header on wide screens, under the counts on phones. -->
{#snippet filters(cls: string)}
	<div class={cls}>
		<nav
			aria-label="Filter by category"
			class="grid grid-cols-4 rounded-lg bg-muted p-1 text-sm font-medium lg:w-md"
		>
			{#each [{ value: '', label: 'All' }, ...CATEGORIES] as c (c.value)}
				<a
					href={query({ category: c.value })}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
					aria-current={data.category === c.value ? 'page' : undefined}
					title={c.label}
					class="truncate rounded-md px-2 py-1.5 text-center {data.category === c.value
						? 'bg-background shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{c.label}
				</a>
			{/each}
		</nav>
		{#if !data.user.locationId}
			<div class="lg:w-56">
				<SelectField
					aria-label="Filter by location"
					options={[
						{ value: '', label: 'All locations' },
						...data.locations.map((l) => ({ value: l.id, label: l.name }))
					]}
					value={data.locationId}
					onchange={go}
				/>
			</div>
		{/if}
	</div>
{/snippet}

<PageHeader title="Due">
	{#snippet actions()}
		{@render filters('mr-2 hidden items-center gap-2 lg:flex')}
	{/snippet}
</PageHeader>
<main class="mx-auto {WIDE_PAGE}">
	<!-- gap, not space-y: the phone filters are display:none on wide screens. -->
	<div class="flex flex-col gap-4 p-4">
		<Loading data={data.list} id="due-counts" {sample}>
			{#snippet children(list)}
				{#if list.scheduled || filtered}
					<!-- Item counts by flag. Each one filters the list to its items; tapping it again clears.
			     Selected is a soft fill with a faint ring inside the cell. Zero counts don't link. -->
					<nav
						aria-label="Filter by flag"
						class="grid grid-cols-4 divide-x rounded-xl border bg-card"
					>
						{#each tiles as tile (tile.flag)}
							{@const value = list.counts[tile.flag]}
							{@const selected = data.flag === tile.flag}
							{#snippet content()}
								<span
									class="block text-2xl font-semibold tabular-nums {value
										? tile.tone
										: 'text-muted-foreground'}"
								>
									{value}
								</span>
								<span
									class="block truncate text-xs text-muted-foreground {selected
										? 'font-medium text-foreground'
										: ''}"
								>
									{tile.label}
								</span>
							{/snippet}
							<div class="p-1">
								{#if value || selected}
									<a
										href={query({ flag: selected ? '' : tile.flag })}
										data-sveltekit-replacestate
										data-sveltekit-noscroll
										aria-current={selected ? 'true' : undefined}
										class="block rounded-lg px-1 py-2 text-center {selected
											? 'bg-primary/[.07] ring-1 ring-primary/25 ring-inset'
											: 'hover:bg-muted/60 active:bg-muted'}"
									>
										{@render content()}
									</a>
								{:else}
									<div class="px-1 py-2 text-center">{@render content()}</div>
								{/if}
							</div>
						{/each}
					</nav>
				{/if}
			{/snippet}
		</Loading>
		{@render filters('space-y-2 lg:hidden')}
	</div>
	<Loading data={data.list} id="due-list" {sample}>
		{#snippet children(list)}
			{#if !list.scheduled}
				<p class="p-8 text-center text-muted-foreground">
					{filtered
						? 'No scheduled items match these filters.'
						: 'Items show here once they have a service schedule.'}
				</p>
			{/if}

			{#each list.groups as group (group.value)}
				<section class="pb-4">
					<h2 class="px-4 pb-2 font-semibold">{group.label}</h2>
					<ul class={CARD_GRID}>
						{#each group.items as item (item.id)}
							<li>
								<a href="/equipment/{item.id}" class="block h-full space-y-2 p-4 {CARD_LINK}">
									<div class="min-w-0">
										<p class="truncate font-medium">{item.name}</p>
										<p class="truncate text-sm text-muted-foreground">
											{item.locationName} ·
											{#if !item.meterUnit}
												no meter
											{:else if item.reading}
												{item.reading.value}
												{meterShort(item.meterUnit)} on {formatDate(item.reading.readOn)}
											{:else}
												no reading yet
											{/if}
										</p>
									</div>
									<ul class="space-y-1 text-sm">
										{#each item.jobs as job (job.id)}
											<li class="flex items-center justify-between gap-2">
												<span class="min-w-0 truncate">{job.name}</span>
												<DueBadge
													state={job.due.state}
													label={dueLabel(job.due, meterShort(item.meterUnit), data.today)}
												/>
											</li>
										{/each}
									</ul>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
			<Pager next={list.next} prev={list.prev} />
		{/snippet}
	</Loading>
</main>
