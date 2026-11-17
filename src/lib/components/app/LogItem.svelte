<script lang="ts">
	import { doneBy, formatDate, logTypeLabel } from '$lib/constants';
	import PhotoStrip from './PhotoStrip.svelte';
	import { CARD } from '$lib/utils';

	let {
		log,
		equipmentName
	}: {
		log: {
			id: string;
			equipmentId: string;
			type: string;
			summary: string | null;
			description: string;
			performedBy: string | null;
			importKey?: string | null;
			performedOn: string;
			author: { name: string } | null;
			photos: { id: string }[];
		};
		equipmentName?: string;
	} = $props();

	// The summary, or the description's first line when there is none; the rest is the detail.
	const firstLine = $derived(log.description.split('\n')[0]);
	const title = $derived(log.summary ?? firstLine);
	const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
	// Hidden when it only repeats the title ("Oil change" / "Oil change.").
	const detail = $derived.by(() => {
		const rest = log.summary ? log.description : log.description.slice(firstLine.length).trim();
		return plain(rest) === plain(title) ? '' : rest;
	});
</script>

<!-- What was done leads; date top right for scanning; type and who on one quiet line. -->
<article class="space-y-2 overflow-hidden p-4 {CARD}">
	<a href="/equipment/{log.equipmentId}/logs/{log.id}" class="block space-y-1">
		<div class="flex items-baseline justify-between gap-3">
			<p class="min-w-0 font-medium {equipmentName ? 'truncate' : 'line-clamp-2'}">
				{equipmentName ?? title}
			</p>
			<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
				{formatDate(log.performedOn)}
			</span>
		</div>
		{#if equipmentName}<p class="line-clamp-2 text-sm">{title}</p>{/if}
		{#if detail}
			<p class="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">{detail}</p>
		{/if}
		<p class="truncate text-sm text-muted-foreground">
			{logTypeLabel(log.type)}{#if doneBy(log)}&nbsp;· {doneBy(log)}{/if}
		</p>
	</a>
	<PhotoStrip photos={log.photos} />
</article>
