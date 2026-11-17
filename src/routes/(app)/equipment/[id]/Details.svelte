<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import X from '@lucide/svelte/icons/x';
	import { enhance } from '$app/forms';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { PageData, ActionData } from './$types';
	import ClipboardPlus from '@lucide/svelte/icons/clipboard-plus';
	import type Pencil from '@lucide/svelte/icons/pencil';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import DueBadge from '$lib/components/app/DueBadge.svelte';
	import LogItem from '$lib/components/app/LogItem.svelte';
	import MeterCard from '$lib/components/app/MeterCard.svelte';
	import PhotoStrip from '$lib/components/app/PhotoStrip.svelte';
	import ServiceSchedule from '$lib/components/app/ServiceSchedule.svelte';
	import StatusBadge from '$lib/components/app/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { categoryLabel } from '$lib/constants';
	import { can } from '$lib/permissions';
	import { CARD_LIST, namesPage, WIDE_PAGE } from '$lib/utils';

	// The page's streamed data, once loaded.
	let {
		data,
		form
	}: { data: Awaited<PageData['page']> & Pick<PageData, 'user'>; form: ActionData } = $props();
	const item = $derived(data.item);
	// Beside a saved page's name: the page if the name doesn't say it, and the job it's for.
	const pageDetail = (b: { page: number; label: string; serviceJobId: string | null }) =>
		[
			!namesPage(b.label, b.page) && `p. ${b.page}`,
			data.jobs.find((j) => j.id === b.serviceJobId)?.name
		]
			.filter(Boolean)
			.join(' · ');

	const specs = $derived(
		[
			['Category', categoryLabel(item.category)],
			['Kind', item.kind],
			['Place', item.place],
			['Primary operator', item.operatorName],
			['Manufacturer', item.manufacturer],
			['Model', item.model],
			['Year', item.year?.toString()],
			['Serial number', item.serialNumber]
		].filter(([, value]) => value)
	);

	let notesEl = $state<HTMLElement>();
	let notesOpen = $state(false);
	let notesClamped = $state(false);
	// Only offer "Show more" when the clamp actually hides text.
	$effect(() => {
		void item.notes;
		if (!notesEl || notesOpen) return;
		const el = notesEl;
		const check = () => (notesClamped = el.scrollHeight > el.clientHeight);
		check();
		const observer = new ResizeObserver(check);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

{#snippet action(href: string, label: string, Icon: typeof Pencil)}
	<a
		{href}
		class="flex flex-col items-center gap-1 rounded-xl bg-muted py-3 text-xs font-medium active:opacity-70"
	>
		<Icon class="size-5" />
		{label}
	</a>
{/snippet}

<!-- Wide screens: details on the left; schedule and history stacked on the right, or in their own
     columns from 1800px (the wrapper turns into display:contents). Each column keeps its own
     16px padding as the gutter. -->
<main
	class="mx-auto space-y-4 py-4 lg:grid lg:grid-cols-2 lg:items-start lg:space-y-0 min-[112.5rem]:grid-cols-3 {WIDE_PAGE} {can(
		data.user,
		'log.create'
	)
		? 'max-md:pb-24'
		: ''}"
>
	<div class="space-y-4 px-4">
		<PhotoStrip photos={item.photos} large />
		<div class="flex items-center justify-between gap-2">
			<a href="/?location={item.location.id}" class="truncate text-muted-foreground underline">
				{item.location.name}
			</a>
			<div class="flex shrink-0 gap-1.5">
				{#if data.worst}<DueBadge state={data.worst} />{/if}
				<StatusBadge status={item.status} />
			</div>
		</div>

		<!-- Phones: tiles, with Add log as the floating button below. -->
		<div class="flex gap-2 *:flex-1 md:hidden">
			{#if can(data.user, 'ai.use')}
				{@render action(`/equipment/${item.id}/ask`, 'Ask AI', Sparkles)}
			{/if}
			{@render action(`/equipment/${item.id}/label`, 'QR label', QrCode)}
		</div>
		<!-- From md (sidebar layout): buttons sharing the row; the QR label shows under the details. -->
		{#if can(data.user, 'log.create') || can(data.user, 'ai.use')}
			<div class="hidden gap-2 *:flex-1 md:flex">
				{#if can(data.user, 'log.create')}
					<Button href="/equipment/{item.id}/logs/new" class="h-11 w-full">
						<ClipboardPlus class="size-5" />
						Add log
					</Button>
				{/if}
				{#if can(data.user, 'ai.use')}
					<Button href="/equipment/{item.id}/ask" variant="outline" class="h-11 w-full">
						<Sparkles class="size-5" />
						Ask AI
					</Button>
				{/if}
			</div>
		{/if}

		{#if item.attachedTo || item.attachments.length}
			<p class="text-sm">
				{#if item.attachedTo}
					Attached to <a href="/equipment/{item.attachedTo.id}" class="font-medium underline"
						>{item.attachedTo.name}</a
					>
				{:else}
					Attached:
					{#each item.attachments as a, i (a.id)}{i ? ', ' : ''}<a
							href="/equipment/{a.id}"
							class="font-medium underline">{a.name}</a
						>{/each}
				{/if}
			</p>
		{/if}

		{#if item.meterUnit}
			<MeterCard
				meterUnit={item.meterUnit}
				reading={data.reading}
				canRecord={can(data.user, 'log.create')}
				error={form && 'readingError' in form ? form.readingError : undefined}
				confirmLower={!!form && 'confirmLower' in form && form.confirmLower === true}
			/>
		{/if}

		{#if specs.length || item.notes}
			<dl class="divide-y rounded-xl border text-sm">
				{#each specs as [label, value] (label)}
					<div class="flex justify-between gap-4 p-3">
						<dt class="text-muted-foreground">{label}</dt>
						<dd class="truncate font-medium">{value}</dd>
					</div>
				{/each}
				{#if item.notes}
					<div class="space-y-1 p-3">
						<dt class="text-muted-foreground">Notes</dt>
						<dd
							id="notes"
							bind:this={notesEl}
							class="overflow-hidden whitespace-pre-wrap transition-[height] duration-200 ease-out motion-reduce:transition-none {notesOpen
								? 'h-auto'
								: 'clamp-4'} {notesClamped && !notesOpen
								? 'mask-[linear-gradient(to_bottom,black_3lh,transparent_4lh)]'
								: ''}"
						>
							{item.notes}
						</dd>
						{#if notesClamped || notesOpen}
							<button
								type="button"
								aria-expanded={notesOpen}
								aria-controls="notes"
								class="font-medium text-primary hover:underline"
								onclick={() => (notesOpen = !notesOpen)}
							>
								{notesOpen ? 'Show less' : 'Show more'}
							</button>
						{/if}
					</div>
				{/if}
			</dl>
		{/if}
		<!-- Wide screens only; phones reach the label from the QR label tile. -->
		<div class="hidden items-center gap-4 rounded-xl border p-4 md:flex">
			<!-- White on every theme, since it gets scanned. -->
			<div class="w-24 shrink-0 rounded-lg bg-white p-1 ring-1 ring-border">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated server-side by qrcode -->
				{@html data.label}
			</div>
			<div class="min-w-0 flex-1 space-y-3">
				<div class="text-sm">
					<p class="font-medium">QR label</p>
					<p class="text-muted-foreground">To be printed and attached to the equipment</p>
				</div>
				<Button
					variant="outline"
					class="h-11 w-full"
					href="data:image/svg+xml;charset=utf-8,{encodeURIComponent(data.labelDownload)}"
					download="{item.name}-qr.svg"
				>
					Download SVG
				</Button>
			</div>
		</div>
		{#if item.manual}
			<!-- One card: the manual, then its saved pages indented under its name. -->
			<div class="overflow-hidden rounded-xl border text-sm">
				<a
					href="/manuals/{item.manual.id}?from={item.id}"
					class="flex items-center gap-3 p-3 hover:bg-muted/50 active:bg-muted"
				>
					<BookOpen class="size-5 shrink-0" />
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{item.manual.name}</span>
						<span class="block text-muted-foreground">
							Operator manual · {item.manual.pageCount}
							{item.manual.pageCount === 1 ? 'page' : 'pages'}
						</span>
					</span>
					<ChevronRight class="size-5 shrink-0 text-muted-foreground" />
				</a>
				{#if data.bookmarks.length}
					<div class="border-t pb-1">
						<h3 class="pt-2 pb-1 pl-11 text-xs font-medium text-muted-foreground">Saved pages</h3>
						<ul>
							{#each data.bookmarks as bookmark (bookmark.id)}
								<li class="flex items-center hover:bg-muted/50">
									<a
										href="/manuals/{item.manual.id}?page={bookmark.page}&from={item.id}"
										class="flex min-h-11 min-w-0 flex-1 items-center gap-2 pl-11"
									>
										<Bookmark class="size-4 shrink-0 text-muted-foreground" />
										<span class="min-w-0 truncate">{bookmark.label}</span>
										{#if pageDetail(bookmark)}
											<span class="min-w-0 truncate text-muted-foreground">
												{pageDetail(bookmark)}
											</span>
										{/if}
									</a>
									{#if can(data.user, 'equipment.update')}
										<form method="POST" action="?/deleteBookmark" use:enhance>
											<input type="hidden" name="bookmarkId" value={bookmark.id} />
											<button
												aria-label="Remove {bookmark.label}"
												class="flex size-11 items-center justify-center text-muted-foreground hover:text-foreground active:bg-muted"
											>
												<X class="size-4" />
											</button>
										</form>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="space-y-4 lg:space-y-6 min-[112.5rem]:contents min-[112.5rem]:space-y-0">
		{#if data.jobs.length || can(data.user, 'equipment.update')}
			<section>
				<div class="flex items-center justify-between gap-2 px-4 pb-2">
					<h2 class="font-semibold">Service schedule</h2>
					{#if can(data.user, 'equipment.update')}
						<a href="/equipment/{item.id}/edit#service" class="text-sm underline">
							{data.jobs.length ? 'Edit' : 'Add jobs'}
						</a>
					{/if}
				</div>
				{#if data.jobs.length}
					<ServiceSchedule
						jobs={data.jobs}
						meterUnit={item.meterUnit}
						today={data.today}
						pages={item.manual
							? data.bookmarks.map((b) => ({
									...b,
									href: `/manuals/${item.manual!.id}?page=${b.page}&from=${item.id}`
								}))
							: []}
						logHref={can(data.user, 'log.create') ? `/equipment/${item.id}/logs/new` : undefined}
					/>
				{:else}
					<p class="px-4 text-sm text-muted-foreground">No repeating service jobs yet.</p>
				{/if}
			</section>
		{/if}

		<section>
			<h2 class="px-4 pb-2 font-semibold">
				<a
					href="/equipment/{item.id}/logs"
					class="inline-flex min-h-11 items-center gap-1 hover:underline md:min-h-0"
				>
					Maintenance history
					<ChevronRight class="size-4 text-muted-foreground" />
				</a>
			</h2>
			{#if item.logs.length}
				<div class={CARD_LIST}>
					{#each item.logs.slice(0, 5) as log (log.id)}
						<LogItem {log} />
					{/each}
				</div>
				{#if item.logs.length > 5}
					<a
						href="/equipment/{item.id}/logs"
						class="mx-4 mt-2 flex min-h-11 items-center justify-center gap-1 rounded-xl border text-sm font-medium hover:bg-muted/50 active:bg-muted"
					>
						View full history
						<ChevronRight class="size-4" />
					</a>
				{/if}
			{:else}
				<p class="px-4 text-sm text-muted-foreground">No maintenance logged yet.</p>
			{/if}
		</section>
	</div>
</main>
