<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { page } from '$app/state';

	// Cursors from paginate(): prev '' means the first page. Labels suit the list's order.
	let {
		next,
		prev,
		prevLabel = 'Previous',
		nextLabel = 'Next'
	}: {
		next: string | null;
		prev: string | null;
		prevLabel?: string;
		nextLabel?: string;
	} = $props();

	// Keeps the filters, swapping only the cursor.
	function href(param: 'after' | 'before', cursor: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built per call, not state
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('after');
		params.delete('before');
		if (cursor) params.set(param, cursor);
		return params.size ? `?${params}` : page.url.pathname;
	}
	const link = 'flex min-h-11 items-center gap-1 rounded-lg px-3 hover:bg-muted/50 active:bg-muted';
</script>

{#if next !== null || prev !== null}
	<nav aria-label="Pages" class="flex items-center justify-between px-4 pb-4 text-sm font-medium">
		{#if prev !== null}
			<a href={href('before', prev)} class={link}>
				<ChevronLeft class="size-4" />{prevLabel}
			</a>
		{:else}
			<span></span>
		{/if}
		{#if next !== null}
			<a href={href('after', next)} class={link}>
				{nextLabel}<ChevronRight class="size-4" />
			</a>
		{/if}
	</nav>
{/if}
