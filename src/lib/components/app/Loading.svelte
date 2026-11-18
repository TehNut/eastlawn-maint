<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { Skeleton } from 'skullet/svelte';

	// `sample` only shapes the first skeleton, so it needn't type-check as T.
	// Streams a load's promise: a skeleton until it settles, then the content or its error.
	let {
		data,
		id,
		sample,
		children: content
	}: { data: Promise<T>; id: string; sample?: unknown; children: Snippet<[T]> } = $props();

	// A streamed error() arrives as { message } or an HttpError with it on .body.
	const message = (e: unknown) => {
		const err = e as { message?: string; body?: { message?: string } } | null;
		return err?.body?.message ?? err?.message ?? 'Something went wrong';
	};
</script>

<!-- shortcut: skullet 0.0.3 can't fade a pane back in if a fast reload brings it back mid fade-out
     (fadeIn is cached per node), leaving results at opacity 0. Remount per promise; drop when fixed upstream. -->
{#key data}
	<Skeleton {data} {id} {sample} label="Loading">
		{#snippet children(value: T)}{@render content(value)}{/snippet}
		{#snippet errorMessage(e)}
			<p class="p-8 text-center text-muted-foreground">{message(e)}</p>
		{/snippet}
	</Skeleton>
{/key}
