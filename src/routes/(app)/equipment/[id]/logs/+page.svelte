<script lang="ts">
	import { page } from '$app/state';
	import Loading from '$lib/components/app/Loading.svelte';
	import LogItem from '$lib/components/app/LogItem.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import Pager from '$lib/components/app/Pager.svelte';
	import { sampleLogs } from '$lib/samples';
	import { CARD_LIST } from '$lib/utils';

	let { data } = $props();
</script>

<PageHeader
	title={data.page.then((p) => `${p.item.name} history`).catch(() => '')}
	back="/equipment/{page.params.id}"
/>
<main class="mx-auto max-w-3xl space-y-4 pt-4">
	<Loading
		data={data.page}
		id="equipment-logs"
		sample={{ logs: sampleLogs(), next: null, prev: null }}
	>
		{#snippet children(p)}
			{#if p.logs.length}
				<div class={CARD_LIST}>
					{#each p.logs as log (log.id)}
						<LogItem {log} />
					{/each}
				</div>
			{:else}
				<p class="p-8 text-center text-muted-foreground">
					{p.prev !== null ? 'No more logs.' : 'No maintenance logged yet.'}
				</p>
			{/if}
			<Pager next={p.next} prev={p.prev} prevLabel="Newer" nextLabel="Older" />
		{/snippet}
	</Loading>
</main>
