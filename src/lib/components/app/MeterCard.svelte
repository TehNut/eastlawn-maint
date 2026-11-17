<script lang="ts">
	import Gauge from '@lucide/svelte/icons/gauge';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { formatDate, METER_UNITS } from '$lib/constants';
	import ErrorText from './ErrorText.svelte';

	let {
		meterUnit,
		reading,
		canRecord,
		error,
		confirmLower
	}: {
		meterUnit: string;
		reading: { value: number; readOn: string } | null;
		canRecord: boolean;
		error?: string;
		confirmLower?: boolean;
	} = $props();

	const unitLabel = $derived(
		METER_UNITS.find((u) => u.value === meterUnit)?.label.toLowerCase() ?? meterUnit
	);
	let open = $state(false);
	let busy = $state(false);
	let date = $state('');
	onMount(() => (date = new Date().toLocaleDateString('en-CA')));
	$effect(() => {
		if (error) open = true;
	});
</script>

<div class="space-y-3 rounded-xl border p-3 text-sm">
	<div class="flex items-center gap-3">
		<Gauge class="size-5 shrink-0" />
		<p class="min-w-0 flex-1">
			{#if reading}
				<span class="font-medium">{reading.value} {unitLabel}</span>
				<span class="text-muted-foreground">on {formatDate(reading.readOn)}</span>
			{:else}
				<span class="text-muted-foreground">No meter reading recorded yet</span>
			{/if}
		</p>
		{#if canRecord && !open}
			<Button variant="outline" class="h-11" onclick={() => (open = true)}>Record</Button>
		{/if}
	</div>
	{#if open}
		<form
			method="POST"
			action="?/recordReading"
			class="space-y-2"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					busy = false;
					if (result.type === 'success') {
						open = false;
						toast.success('Reading recorded');
					}
				};
			}}
		>
			<div class="grid grid-cols-2 gap-2">
				<Input
					name="value"
					type="number"
					inputmode="decimal"
					min={0}
					step="any"
					required
					aria-label="Reading in {unitLabel}"
					placeholder={unitLabel}
				/>
				<Input name="readOn" type="date" required aria-label="Date read" bind:value={date} />
			</div>
			{#if confirmLower}
				<label class="flex min-h-11 items-center gap-3">
					<input type="checkbox" name="confirmLower" class="size-5" />
					The meter really reads lower (it was replaced or reset)
				</label>
			{/if}
			<ErrorText message={error} />
			<div class="flex gap-2">
				<Button type="button" variant="ghost" class="h-11 flex-1" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" class="h-11 flex-1" disabled={busy}>
					{busy ? 'Saving…' : 'Save reading'}
				</Button>
			</div>
		</form>
	{/if}
</div>
