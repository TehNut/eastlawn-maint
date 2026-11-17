<script lang="ts">
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();
</script>

<div class="no-print">
	<PageHeader title="QR label" back="/equipment/{data.item.id}" />
</div>
<main class="mx-auto max-w-sm space-y-6 p-4 print:max-w-none print:p-0">
	<div class="mx-auto w-64 rounded-xl bg-white p-4 text-center text-black print:rounded-none">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG generated server-side by qrcode -->
		{@html data.svg}
		<p class="mt-2 font-semibold">{data.item.name}</p>
		<p class="text-sm">{data.item.location.name}</p>
		{#if data.item.serialNumber}<p class="text-xs">SN {data.item.serialNumber}</p>{/if}
	</div>
	<p class="no-print text-center text-sm text-muted-foreground">
		Scanning this opens a new maintenance log for this item.
	</p>
	<div class="no-print space-y-2">
		<Button class="h-11 w-full" onclick={() => window.print()}>Print label</Button>
		<Button
			variant="outline"
			class="h-11 w-full"
			href="data:image/svg+xml;charset=utf-8,{encodeURIComponent(data.download)}"
			download="{data.item.name}-qr.svg"
		>
			Download SVG
		</Button>
	</div>
</main>
