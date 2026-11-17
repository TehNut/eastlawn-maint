<script lang="ts">
	import { page } from '$app/state';
	import Loading from '$lib/components/app/Loading.svelte';
	import ConfirmDelete from '$lib/components/app/ConfirmDelete.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import PhotoStrip from '$lib/components/app/PhotoStrip.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { doneBy, formatDate, logTypeLabel, meterShort } from '$lib/constants';
	import { can } from '$lib/permissions';

	let { data } = $props();
</script>

<PageHeader
	title={data.page.then((p) => p.log.equipment.name).catch(() => '')}
	back="/equipment/{page.params.id}"
/>
<Loading data={data.page} id="log">
	{#snippet children({ log })}
		<main class="mx-auto max-w-3xl space-y-4 p-4">
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				<Badge variant="outline">{logTypeLabel(log.type)}</Badge>
				<span>{formatDate(log.performedOn)}</span>
				{#if doneBy(log)}<span class="truncate">· {doneBy(log)}</span>{/if}
			</div>
			{#if log.summary}<h2 class="text-lg font-semibold">{log.summary}</h2>{/if}
			<p class="whitespace-pre-wrap">{log.description}</p>
			{#if log.meterReading != null || log.serviceJobs.length}
				<dl class="divide-y rounded-xl border text-sm">
					{#if log.meterReading != null}
						<div class="flex justify-between gap-4 p-3">
							<dt class="text-muted-foreground">Meter</dt>
							<dd class="font-medium">
								{log.meterReading}
								{meterShort(log.equipment.meterUnit)}
							</dd>
						</div>
					{/if}
					{#if log.serviceJobs.length}
						<!-- Jobs from the item's service schedule that this log completed. -->
						<div class="flex justify-between gap-4 p-3">
							<dt class="text-muted-foreground">
								{log.serviceJobs.length === 1 ? 'Scheduled service' : 'Scheduled services'}
							</dt>
							<dd class="text-right font-medium">
								{log.serviceJobs.map((j) => j.serviceJob.name).join(', ')}
							</dd>
						</div>
					{/if}
				</dl>
			{/if}
			{#if log.partsUsed.length}
				<section class="space-y-2">
					<h2 class="font-semibold">Parts used</h2>
					<ul class="divide-y rounded-xl border text-sm">
						{#each log.partsUsed as part, i (i)}
							<li class="flex justify-between gap-4 p-3">
								<span class="min-w-0">
									<span class="block font-medium">{part.item}</span>
									<span class="block text-muted-foreground">{part.spec || 'Spec not recorded'}</span
									>
								</span>
								{#if part.qty}<span class="shrink-0">{part.qty}</span>{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			<PhotoStrip photos={log.photos} large />
			{#if can(data.user, 'log.update')}
				<Button
					variant="outline"
					class="h-11 w-full"
					href="/equipment/{log.equipment.id}/logs/{log.id}/edit"
				>
					Edit log
				</Button>
			{/if}
			{#if can(data.user, 'log.delete')}
				<ConfirmDelete
					label="Delete log"
					description="This permanently removes this log and its photos."
				/>
			{/if}
		</main>
	{/snippet}
</Loading>
