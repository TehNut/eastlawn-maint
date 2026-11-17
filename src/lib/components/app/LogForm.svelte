<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		formatDate,
		LOG_TYPES,
		METER_UNITS,
		STATUSES,
		type LogPreset,
		type Part
	} from '$lib/constants';
	import ErrorText from './ErrorText.svelte';
	import PartsEditor from './PartsEditor.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import SelectField from './SelectField.svelte';

	type Values = {
		type: string;
		summary: string | null;
		performedOn: string;
		description: string;
		meterReading: number | null;
		performedBy: string | null;
		partsUsed: Part[];
		serviceJobIds: string[];
	};
	type Job = { id: string; name: string; consumables: Part[] };

	let {
		values,
		status,
		error,
		confirmLower,
		action,
		submitLabel,
		presets = [],
		customizeHref,
		meterUnit = null,
		reading = null,
		readingRequired = false,
		jobs = [],
		preselect = []
	}: {
		values?: Values;
		// Current equipment status; omit to hide the status field.
		status?: string;
		error?: string;
		// Set by the server when the reading is lower than an earlier one.
		confirmLower?: boolean;
		action?: string;
		submitLabel: string;
		presets?: LogPreset[];
		customizeHref?: string;
		// Null hides the meter field: the item has no meter.
		meterUnit?: string | null;
		// The item's current reading, as a hint.
		reading?: { value: number; readOn: string } | null;
		readingRequired?: boolean;
		// The item's service jobs, to mark which this log completed.
		jobs?: Job[];
		// Job ids to tick on a new log, as if the user had ticked them.
		preselect?: string[];
	} = $props();

	let busy = $state(false);
	let date = $state('');
	onMount(() => {
		// Set on the client so it's today in the technician's timezone, not the server's.
		date = values?.performedOn ?? new Date().toLocaleDateString('en-CA');
		for (const job of jobs) if (preselect.includes(job.id)) toggleJob(job, true);
	});

	let type = $state<string>(untrack(() => values?.type ?? LOG_TYPES[0].value));
	let summary = $state(untrack(() => values?.summary ?? ''));
	let description = $state(untrack(() => values?.description ?? ''));
	let parts = $state<Part[]>(untrack(() => values?.partsUsed.map((p) => ({ ...p })) ?? []));
	let jobIds = $state<string[]>(untrack(() => [...(values?.serviceJobIds ?? [])]));

	const unitLabel = $derived(
		METER_UNITS.find((u) => u.value === meterUnit)?.label.toLowerCase() ?? ''
	);

	// Fills in what a scheduled job usually means, but never removes anything the user typed.
	function toggleJob(job: Job, checked: boolean) {
		if (!checked) {
			jobIds = jobIds.filter((id) => id !== job.id);
			return;
		}
		jobIds = [...jobIds, job.id];
		type = 'service';
		if (!summary.trim()) summary = job.name;
		const current = description.trim();
		if (!current.includes(job.name))
			description = current ? `${current}\n${job.name}.` : `${job.name}.`;
		for (const c of job.consumables) {
			if (!parts.some((p) => p.item === c.item && p.spec === c.spec)) parts.push({ ...c });
		}
	}

	// Adds to the text rather than replacing it, so presets combine and typing is never lost.
	function applyPreset(preset: LogPreset) {
		type = preset.type;
		const current = description.trim();
		if (current.includes(preset.description)) return;
		description = current ? `${current}\n${preset.description}` : preset.description;
	}
</script>

<form
	method="POST"
	{action}
	enctype="multipart/form-data"
	class="flex flex-1 flex-col gap-4"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div class="grid grid-cols-2 gap-3">
		<div class="space-y-1.5">
			<Label for="type">Type</Label>
			<SelectField id="type" name="type" options={LOG_TYPES} bind:value={type} />
		</div>
		<div class="space-y-1.5">
			<Label for="performedOn">Date</Label>
			<Input id="performedOn" name="performedOn" type="date" required bind:value={date} />
		</div>
	</div>
	{#if meterUnit}
		<div class="space-y-1.5">
			<Label for="meterReading">Meter ({unitLabel})</Label>
			<Input
				id="meterReading"
				name="meterReading"
				type="number"
				inputmode="decimal"
				min={0}
				step="any"
				required={readingRequired}
				value={values?.meterReading ?? ''}
			/>
			{#if reading}
				<p class="text-sm text-muted-foreground">
					Last reading {reading.value} on {formatDate(reading.readOn)}
				</p>
			{/if}
			{#if confirmLower}
				<label class="flex min-h-11 items-center gap-3 text-sm">
					<input type="checkbox" name="confirmLower" class="size-5" />
					The meter really reads lower (it was replaced or reset)
				</label>
			{/if}
		</div>
	{/if}
	{#if jobs.length}
		<fieldset class="space-y-1">
			<legend class="mb-1.5 text-sm font-medium">Service jobs completed</legend>
			{#each jobs as job (job.id)}
				<label class="flex min-h-11 items-center gap-3 text-sm">
					<input
						type="checkbox"
						name="serviceJobIds"
						value={job.id}
						class="size-5"
						checked={jobIds.includes(job.id)}
						onchange={(e) => toggleJob(job, e.currentTarget.checked)}
					/>
					{job.name}
				</label>
			{/each}
		</fieldset>
	{/if}
	<div class="space-y-1.5">
		<Label for="summary">Summary</Label>
		<Input
			id="summary"
			name="summary"
			maxlength={200}
			placeholder="One line, e.g. Engine oil and filter"
			bind:value={summary}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="description">What was done?</Label>
		<Textarea id="description" name="description" required rows={5} bind:value={description} />
	</div>
	<div class="space-y-1.5">
		<Label>Parts used</Label>
		<input type="hidden" name="partsUsed" value={JSON.stringify(parts)} />
		<PartsEditor bind:parts />
	</div>
	<div class="space-y-1.5">
		<Label for="performedBy">Done by</Label>
		<Input
			id="performedBy"
			name="performedBy"
			maxlength={100}
			placeholder="Leave blank if it was you"
			value={values?.performedBy ?? ''}
		/>
	</div>
	<div class="space-y-1.5">
		<Label>{values ? 'Add photos' : 'Photos'}</Label>
		<PhotoPicker />
	</div>
	{#if status}
		<div class="space-y-1.5">
			<Label for="status">Equipment status</Label>
			<SelectField id="status" name="status" options={STATUSES} value={status} />
		</div>
	{/if}
	<!-- Stays in thumb reach on phones, however long the form gets. -->
	<div
		class="sticky bottom-0 z-10 -mx-4 mt-auto space-y-3 border-t bg-background/90 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
	>
		<ErrorText message={error} />
		{#if presets.length || customizeHref}
			<div
				role="group"
				aria-label="Presets"
				class="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
			>
				{#each presets as preset, i (i)}
					<button
						type="button"
						class="h-11 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap active:bg-muted"
						onclick={() => applyPreset(preset)}
					>
						{preset.label}
					</button>
				{/each}
				{#if customizeHref}
					<a
						href={customizeHref}
						class="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap text-muted-foreground active:bg-muted"
					>
						<Pencil class="size-4" />
						Customize
					</a>
				{/if}
			</div>
		{/if}
		<Button type="submit" class="h-11 w-full" disabled={busy}>
			{busy ? 'Saving…' : submitLabel}
		</Button>
	</div>
</form>
