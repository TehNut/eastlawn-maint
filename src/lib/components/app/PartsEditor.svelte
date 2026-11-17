<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { MAX_PARTS, type Part } from '$lib/constants';
	import { crossSpec, offStandard, standardsFor, type Standard } from '$lib/standards';

	// Edits the list in place; the parent serializes it. Standards are for service job
	// consumables only: a log's parts record what was actually installed.
	let {
		parts = $bindable(),
		addLabel = 'Add part',
		standards = []
	}: { parts: Part[]; addLabel?: string; standards?: Standard[] } = $props();

	// The row whose spec helper is open, and what's typed into it.
	let formatting = $state<{ index: number; brand: string; number: string; oem: string } | null>(
		null
	);
	const brands = (matching: Standard[]) => [...new Set(matching.map((s) => s.brand))].join(' or ');
</script>

<div class="space-y-2">
	{#each parts as part, i (part)}
		{@const matching = standardsFor(part.item, standards)}
		{@const cross = matching.find((s) => s.crossFormat)}
		<div class="space-y-1.5">
			<div class="flex gap-2">
				<!-- Two rows, so it fits a phone: item and quantity, then the spec. -->
				<div class="grid min-w-0 flex-1 grid-cols-[1fr_6rem] gap-2">
					<Input
						bind:value={part.item}
						aria-label="Item"
						placeholder="Item"
						required
						maxlength={200}
					/>
					<Input bind:value={part.qty} aria-label="Quantity" placeholder="Qty" maxlength={200} />
					<Input
						bind:value={part.spec}
						aria-label="Spec or part number"
						placeholder="Spec or part number (blank if unknown)"
						maxlength={500}
						class="col-span-2"
					/>
				</div>
				<Button
					type="button"
					variant="ghost"
					aria-label="Remove {part.item || 'part'}"
					class="size-11 shrink-0"
					onclick={() => {
						formatting = null;
						parts.splice(i, 1);
					}}
				>
					<X class="size-4" />
				</Button>
			</div>
			{#if matching.length}
				<p
					class="pr-13 text-xs {offStandard(part.spec, matching)
						? 'text-destructive'
						: 'text-muted-foreground'}"
				>
					{#if offStandard(part.spec, matching)}
						Not the fleet brand. The standard is {brands(matching)}.
					{:else}
						Fleet standard: {brands(matching)}.
					{/if}
					{#if cross && formatting?.index !== i}
						<button
							type="button"
							class="min-h-11 font-medium underline"
							onclick={() => (formatting = { index: i, brand: cross.brand, number: '', oem: '' })}
						>
							Format as {cross.brand}…
						</button>
					{/if}
				</p>
			{/if}
			{#if formatting?.index === i}
				<div class="mr-13 space-y-2 rounded-lg bg-muted p-2">
					<div class="grid grid-cols-2 gap-2">
						<Input
							bind:value={formatting.number}
							aria-label="{formatting.brand} number"
							placeholder="{formatting.brand} no. (if known)"
						/>
						<Input
							bind:value={formatting.oem}
							aria-label="Manual's part number"
							placeholder="Manual's no., e.g. John Deere RE504836"
						/>
					</div>
					<p class="text-xs text-muted-foreground">
						{crossSpec(formatting.brand, formatting.number, formatting.oem)}
					</p>
					<div class="flex gap-2">
						<Button
							type="button"
							variant="ghost"
							class="h-11 flex-1"
							onclick={() => (formatting = null)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							class="h-11 flex-1"
							onclick={() => {
								part.spec = crossSpec(formatting!.brand, formatting!.number, formatting!.oem);
								formatting = null;
							}}
						>
							Use this spec
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{/each}
	{#if parts.length < MAX_PARTS}
		<Button
			type="button"
			variant="outline"
			class="h-11 w-full"
			onclick={() => parts.push({ item: '', spec: '', qty: '' })}
		>
			<Plus class="size-4" />
			{addLabel}
		</Button>
	{/if}
</div>
