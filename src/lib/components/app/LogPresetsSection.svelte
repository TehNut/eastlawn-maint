<script lang="ts">
	import { untrack } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { LOG_TYPES, MAX_LOG_PRESETS, type LogPreset } from '$lib/constants';
	import ErrorText from './ErrorText.svelte';
	import SelectField from './SelectField.svelte';

	let {
		presets,
		error,
		form
	}: {
		presets: LogPreset[];
		error?: string;
		// Id of an outer form to submit with (adding equipment). Without it this saves on its own.
		form?: string;
	} = $props();

	let rows = $state(untrack(() => presets.map((preset) => ({ ...preset }))));
	const payload = $derived(JSON.stringify(rows));
	// Unchanged defaults aren't sent, so a new item keeps following the defaults.
	const initial = untrack(() => JSON.stringify(presets));
	let busy = $state(false);

	const add = () => rows.push({ label: '', type: LOG_TYPES[0].value, description: '' });
	const remove = (index: number) => rows.splice(index, 1);
</script>

<section class="space-y-3">
	<p class="text-sm text-muted-foreground">One-tap entries on this item's add log page.</p>

	{#if form}
		<div class="space-y-3">{@render body()}</div>
	{:else}
		<form
			method="POST"
			action="?/savePresets"
			class="space-y-3"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					await update({ reset: false });
					busy = false;
					if (result.type === 'success') toast.success('Presets saved');
				};
			}}
		>
			{@render body()}
		</form>
	{/if}
</section>

{#snippet body()}
	{#if !form || payload !== initial}
		<input type="hidden" name="presets" value={payload} {form} />
	{/if}
	{#each rows as row, i (row)}
		<div class="space-y-2 rounded-xl border p-3">
			<div class="flex gap-2">
				<Input
					bind:value={row.label}
					aria-label="Preset label"
					placeholder="Label"
					required
					maxlength={40}
					class="min-w-0 flex-1"
				/>
				<Button
					type="button"
					variant="ghost"
					aria-label="Remove {row.label || 'preset'}"
					class="size-11 shrink-0"
					onclick={() => remove(i)}
				>
					<X class="size-4" />
				</Button>
			</div>
			<SelectField aria-label="Log type" options={LOG_TYPES} bind:value={row.type} />
			<Input
				bind:value={row.description}
				aria-label="Log text"
				placeholder="Text added to the log"
				required
				maxlength={5000}
			/>
		</div>
	{/each}
	<ErrorText message={error} />
	<div class="flex gap-2">
		{#if rows.length < MAX_LOG_PRESETS}
			<Button type="button" variant="outline" class="h-11 flex-1" onclick={add}>
				<Plus class="size-4" />
				Add preset
			</Button>
		{/if}
		{#if !form}
			<Button type="submit" class="h-11 flex-1" disabled={busy}>
				{busy ? 'Saving…' : 'Save presets'}
			</Button>
		{/if}
	</div>
{/snippet}
