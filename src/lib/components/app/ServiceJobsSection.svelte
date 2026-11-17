<script lang="ts">
	import { untrack } from 'svelte';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		CALENDAR_UNITS,
		MAX_SERVICE_JOBS,
		METER_UNITS,
		type CalendarUnit,
		type Part
	} from '$lib/constants';
	import type { Standard } from '$lib/standards';
	import ErrorText from './ErrorText.svelte';
	import PartsEditor from './PartsEditor.svelte';
	import SelectField from './SelectField.svelte';

	type Job = {
		id?: string;
		name: string;
		meterEvery: number | null;
		calendarEvery: number | null;
		calendarUnit: CalendarUnit | null;
		consumables: Part[];
		notes: string | null;
	};

	let {
		jobs,
		meterUnit,
		standards = [],
		error,
		form
	}: {
		jobs: Job[];
		meterUnit: string | null;
		standards?: Standard[];
		error?: string;
		// Id of an outer form to submit with (adding equipment). Without it this saves on its own.
		form?: string;
	} = $props();

	type Row = Omit<Job, 'calendarUnit' | 'notes'> & { calendarUnit: CalendarUnit; notes: string };
	const toRow = (job: Job): Row => ({
		...job,
		calendarUnit: job.calendarUnit ?? 'months',
		consumables: job.consumables.map((c) => ({ ...c })),
		notes: job.notes ?? ''
	});
	let rows = $state(untrack(() => jobs.map(toRow)));
	let busy = $state(false);

	const unitLabel = $derived(
		METER_UNITS.find((u) => u.value === meterUnit)?.label.toLowerCase() ?? ''
	);
	// A cleared number input binds as null or undefined.
	const toNumber = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? null : v);
	const payload = $derived(
		JSON.stringify(
			rows.map((r) => ({
				id: r.id,
				name: r.name,
				meterEvery: meterUnit ? toNumber(r.meterEvery) : null,
				calendarEvery: toNumber(r.calendarEvery),
				calendarUnit: r.calendarUnit,
				consumables: r.consumables,
				notes: r.notes
			}))
		)
	);

	const add = () =>
		rows.push({
			name: '',
			meterEvery: null,
			calendarEvery: null,
			calendarUnit: 'months',
			consumables: [],
			notes: ''
		});
	function move(i: number, by: number) {
		const [row] = rows.splice(i, 1);
		rows.splice(i + by, 0, row);
	}
</script>

<section class="space-y-3">
	<div>
		<p class="text-sm text-muted-foreground">
			Repeating jobs. Each is due at its meter or calendar interval, whichever comes first.
			{#if !meterUnit}This item has no meter, so intervals are calendar only.{/if}
		</p>
	</div>

	{#if form}
		<div class="space-y-3">{@render body()}</div>
	{:else}
		<form
			method="POST"
			action="?/saveServiceJobs"
			class="space-y-3"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					busy = false;
					if (result.type === 'success') {
						// Pick up the ids of new jobs, so saving again updates them rather than replacing
						// them and dropping their history.
						rows = jobs.map(toRow);
						toast.success('Service schedule saved');
					}
				};
			}}
		>
			{@render body()}
		</form>
	{/if}
</section>

{#snippet body()}
	{#if !form || rows.length}<input type="hidden" name="jobs" value={payload} {form} />{/if}
	{#each rows as row, i (row)}
		<div class="space-y-3 rounded-xl border p-3">
			<div class="flex gap-1">
				<Input
					bind:value={row.name}
					aria-label="Job name"
					placeholder="Job, e.g. Engine oil and filter"
					required
					maxlength={200}
					class="min-w-0 flex-1"
				/>
				<Button
					type="button"
					variant="ghost"
					aria-label="Move up"
					class="size-11 shrink-0"
					disabled={i === 0}
					onclick={() => move(i, -1)}
				>
					<ArrowUp class="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					aria-label="Move down"
					class="size-11 shrink-0"
					disabled={i === rows.length - 1}
					onclick={() => move(i, 1)}
				>
					<ArrowDown class="size-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					aria-label="Remove {row.name || 'job'}"
					class="size-11 shrink-0"
					onclick={() => rows.splice(i, 1)}
				>
					<X class="size-4" />
				</Button>
			</div>

			<div class="grid gap-3 {meterUnit ? 'sm:grid-cols-2' : ''}">
				{#if meterUnit}
					<div class="space-y-1.5">
						<Label for="meter-{i}">Every ({unitLabel})</Label>
						<Input
							id="meter-{i}"
							type="number"
							inputmode="numeric"
							min={1}
							step={1}
							bind:value={row.meterEvery}
							placeholder="e.g. 200"
						/>
					</div>
				{/if}
				<div class="space-y-1.5">
					<Label for="calendar-{i}">Every (calendar)</Label>
					<div class="flex gap-2">
						<Input
							id="calendar-{i}"
							type="number"
							inputmode="numeric"
							min={1}
							step={1}
							bind:value={row.calendarEvery}
							placeholder="e.g. 12"
							class="min-w-0 flex-1"
						/>
						<div class="w-32 shrink-0">
							<SelectField
								aria-label="Calendar unit"
								options={CALENDAR_UNITS}
								bind:value={row.calendarUnit}
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="space-y-1.5">
				<Label>Consumables</Label>
				<PartsEditor bind:parts={row.consumables} addLabel="Add consumable" {standards} />
			</div>

			<div class="space-y-1.5">
				<Label for="notes-{i}">Notes</Label>
				<Textarea id="notes-{i}" rows={2} maxlength={5000} bind:value={row.notes} />
			</div>
		</div>
	{/each}

	{#if rows.length < jobs.length}
		<p class="text-sm text-muted-foreground">
			Removed jobs are unlinked from past logs when you save. The logs themselves are kept.
		</p>
	{/if}
	<ErrorText message={error} />
	<div class="flex gap-2">
		{#if rows.length < MAX_SERVICE_JOBS}
			<Button type="button" variant="outline" class="h-11 flex-1" onclick={add}>
				<Plus class="size-4" />
				Add job
			</Button>
		{/if}
		{#if !form}
			<Button type="submit" class="h-11 flex-1" disabled={busy}>
				{busy ? 'Saving…' : 'Save schedule'}
			</Button>
		{/if}
	</div>
{/snippet}
