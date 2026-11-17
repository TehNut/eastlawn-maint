<script lang="ts">
	import { untrack } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form } = $props();

	const toRows = (list: typeof data.standards) => list.map((s) => ({ ...s, notes: s.notes ?? '' }));
	let rows = $state(untrack(() => toRows(data.standards)));
	let busy = $state(false);
	const add = () =>
		rows.push({
			id: '',
			product: '',
			matches: '',
			brand: '',
			crossFormat: false,
			notes: '',
			sortOrder: rows.length
		});
</script>

<PageHeader title="Product standards" back="/settings" />
<main class="mx-auto max-w-3xl space-y-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
	<p class="text-sm text-muted-foreground">
		One brand for each product across the fleet. When a service job's consumable matches a keyword,
		the schedule editor suggests the brand and warns if the spec names a different one. It never
		blocks saving. Logs record what was actually installed, so these don't apply to them. Add a
		product here once the fleet picks a brand for it, such as hydraulic oil or coolant.
	</p>

	<form
		method="POST"
		action="?/save"
		class="space-y-3"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') {
					// Pick up ids of new rows, so saving again updates them.
					rows = toRows(data.standards);
					toast.success('Standards saved');
				}
			};
		}}
	>
		<input
			type="hidden"
			name="standards"
			value={JSON.stringify(
				rows.map((r) => ({
					id: r.id || undefined,
					product: r.product,
					matches: r.matches,
					brand: r.brand,
					crossFormat: r.crossFormat,
					notes: r.notes
				}))
			)}
		/>
		{#each rows as row, i (row)}
			<div class="space-y-3 rounded-xl border p-3">
				<div class="flex gap-2">
					<Input
						bind:value={row.product}
						aria-label="Product"
						placeholder="Product, e.g. Diesel engine oil"
						required
						maxlength={100}
						class="min-w-0 flex-1"
					/>
					<Button
						type="button"
						variant="ghost"
						aria-label="Remove {row.product || 'standard'}"
						class="size-11 shrink-0"
						onclick={() => rows.splice(i, 1)}
					>
						<X class="size-4" />
					</Button>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<Label for="brand-{i}">Brand</Label>
						<Input id="brand-{i}" bind:value={row.brand} required maxlength={100} />
					</div>
					<div class="space-y-1.5">
						<Label for="matches-{i}">Matches items with</Label>
						<Input
							id="matches-{i}"
							bind:value={row.matches}
							required
							maxlength={200}
							placeholder="e.g. engine oil"
						/>
					</div>
				</div>
				<label class="flex min-h-11 items-center gap-3 text-sm">
					<input type="checkbox" class="size-5" bind:checked={row.crossFormat} />
					Offer the "{row.brand || 'Brand'} number, crosses to manual's number" spec helper
				</label>
				<div class="space-y-1.5">
					<Label for="notes-{i}">Notes</Label>
					<Textarea id="notes-{i}" rows={2} maxlength={1000} bind:value={row.notes} />
				</div>
			</div>
		{/each}
		<ErrorText message={form?.error} />
		<div class="flex gap-2">
			<Button type="button" variant="outline" class="h-11 flex-1" onclick={add}>
				<Plus class="size-4" />
				Add standard
			</Button>
			<Button type="submit" class="h-11 flex-1" disabled={busy}>
				{busy ? 'Saving…' : 'Save standards'}
			</Button>
		</div>
	</form>
</main>
