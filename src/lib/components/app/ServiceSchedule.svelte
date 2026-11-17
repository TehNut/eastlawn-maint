<script lang="ts">
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ClipboardPlus from '@lucide/svelte/icons/clipboard-plus';
	import { formatDate, meterShort, type Part } from '$lib/constants';
	import { describeInterval, dueLabel, type Due } from '$lib/schedule';
	import DueBadge from './DueBadge.svelte';
	import { CARD, CARD_LIST, namesPage } from '$lib/utils';

	type Job = {
		id: string;
		name: string;
		meterEvery: number | null;
		calendarEvery: number | null;
		calendarUnit: 'days' | 'months' | null;
		consumables: Part[];
		notes: string | null;
		due: Due;
	};

	let {
		jobs,
		meterUnit,
		logHref,
		today,
		pages = []
	}: {
		jobs: Job[];
		meterUnit: string | null;
		today: string;
		// Saved manual pages; those for a job show under it.
		pages?: {
			id: string;
			serviceJobId: string | null;
			label: string;
			page: number;
			href: string;
		}[];
		// Base of the add log link; omit when the user can't add logs.
		logHref?: string;
	} = $props();

	const unit = $derived(meterShort(meterUnit));
	// Phones show each job as name + chip until tapped; wide screens always show everything.
	let open = $state<Record<string, boolean>>({});
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	function meterText(m: NonNullable<Due['meter']>) {
		if (m.remaining == null) return `At ${m.dueAt} ${unit} (no current reading)`;
		if (m.remaining === 0) return `Due at ${m.dueAt} ${unit}`;
		if (m.remaining < 0) return `Due at ${m.dueAt} ${unit}, ${-m.remaining} ${unit} over`;
		const projected = m.projectedOn ? `, about ${formatDate(m.projectedOn)}` : '';
		return `At ${m.dueAt} ${unit} (${m.remaining} ${unit} left${projected})`;
	}

	function calendarText(c: NonNullable<Due['calendar']>) {
		if (c.daysLeft < 0) return `Due since ${formatDate(c.dueOn)}`;
		if (c.daysLeft === 0) return 'Due today';
		return `By ${formatDate(c.dueOn)} (${plural(c.daysLeft, 'day')})`;
	}

	// The threshold that arrives first goes first, as in the skill's due report.
	function nextText(due: Due) {
		const meter = due.meter && meterText(due.meter);
		const calendar = due.calendar && calendarText(due.calendar);
		const both = due.first === 'calendar' ? [calendar, meter] : [meter, calendar];
		return both.filter(Boolean).join(' · ');
	}
</script>

{#if jobs.length}
	<ul class={CARD_LIST}>
		{#each jobs as job (job.id)}
			<li class="text-sm {CARD}">
				<button
					type="button"
					aria-expanded={!!open[job.id]}
					aria-controls="job-{job.id}"
					class="flex min-h-11 w-full items-center gap-2 p-4 text-left lg:pointer-events-none lg:pb-1"
					onclick={() => (open[job.id] = !open[job.id])}
				>
					<!-- Name and interval stay visible when collapsed. -->
					<span class="min-w-0 flex-1">
						<span class="block font-medium">{job.name}</span>
						<span class="block text-muted-foreground">{describeInterval(job, meterUnit)}</span>
					</span>
					<DueBadge state={job.due.state} label={dueLabel(job.due, unit, today)} />
					<ChevronDown
						class="size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none lg:hidden {open[
							job.id
						]
							? 'rotate-180'
							: ''}"
					/>
				</button>
				<!-- Invisible while collapsed so its links aren't focusable; visibility flips after the
				     height transition on close. -->
				<div
					id="job-{job.id}"
					class="overflow-hidden transition-[height,visibility] duration-200 ease-out motion-reduce:transition-none lg:visible lg:h-auto {open[
						job.id
					]
						? 'h-auto'
						: 'invisible h-0'}"
				>
					<div class="space-y-1 px-4 pb-4">
						{#if job.due.last}
							<p>
								Last done {formatDate(job.due.last.performedOn)}{job.due.last.meterReading != null
									? ` at ${job.due.last.meterReading} ${unit}`
									: ''}
							</p>
							{#if nextText(job.due)}<p>Next: {nextText(job.due)}</p>{/if}
							{#if job.meterEvery && !job.due.meter}
								<p class="text-muted-foreground">
									The last log has no meter reading, so only the calendar interval is checked.
								</p>
							{/if}
						{:else}
							<p class="text-muted-foreground">Never logged.</p>
						{/if}
						{#if job.consumables.length || job.notes}
							<details class="pt-1">
								<summary class="flex min-h-11 cursor-pointer items-center text-muted-foreground">
									{job.consumables.length ? plural(job.consumables.length, 'consumable') : 'Notes'}
								</summary>
								{#if job.consumables.length}
									<ul class="space-y-1 pb-2">
										{#each job.consumables as part, i (i)}
											<li>
												<span class="font-medium">{part.item}</span>
												{#if part.qty}· {part.qty}{/if}
												<span class="block text-muted-foreground"
													>{part.spec || 'Spec unknown'}</span
												>
											</li>
										{/each}
									</ul>
								{/if}
								{#if job.notes}<p class="whitespace-pre-wrap text-muted-foreground">
										{job.notes}
									</p>{/if}
							</details>
						{/if}
						{#each pages.filter((p) => p.serviceJobId === job.id) as page (page.id)}
							<a href={page.href} class="flex min-h-11 items-center gap-1.5 underline">
								<Bookmark class="size-4 shrink-0" />
								{page.label}{namesPage(page.label, page.page) ? '' : ` (p. ${page.page})`}
							</a>
						{/each}
						{#if logHref}
							<a
								href="{logHref}?job={job.id}"
								class="inline-flex min-h-11 items-center gap-1.5 font-medium underline"
							>
								<ClipboardPlus class="size-4" />
								Log it
							</a>
						{/if}
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
