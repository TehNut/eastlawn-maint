<script lang="ts" module>
	import type { HastNode, Plugin } from 'svelte-exmarkdown';

	// "(p. 12)", "(pp. 12, 14)", "(page 12)", as the prompts ask the model to cite.
	// shortcut: a range like "(pp. 12–14)" links its two ends only; expand ranges if models use them.
	const CITE = /\((?:pp?\.|pages?)\s*(\d+(?:\s*[-–,]\s*\d+)*)\)/gi;

	type Parent = { children?: HastNode[] };

	// Wraps each page reference in text in a <cite> carrying its page numbers. Code and links stay
	// as they are.
	function wrapCitations(node: Parent) {
		if (!node.children) return;
		node.children = node.children.flatMap((child) => {
			if (child.type === 'element') {
				if (!['a', 'code', 'pre'].includes(child.tagName)) wrapCitations(child);
				return [child];
			}
			if (child.type !== 'text') return [child];
			const out: HastNode[] = [];
			let last = 0;
			for (const match of child.value.matchAll(CITE)) {
				if (match.index > last)
					out.push({ type: 'text', value: child.value.slice(last, match.index) } as HastNode);
				out.push({
					type: 'element',
					tagName: 'cite',
					properties: { dataPages: match[1].match(/\d+/g)!.join(',') },
					children: [{ type: 'text', value: match[0] }]
				} as HastNode);
				last = match.index + match[0].length;
			}
			if (!out.length) return [child];
			if (last < child.value.length)
				out.push({ type: 'text', value: child.value.slice(last) } as HastNode);
			return out;
		});
	}

	const citationPlugin: Plugin = { rehypePlugin: [() => (tree: Parent) => wrapCitations(tree)] };
</script>

<script lang="ts">
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import { Button } from '$lib/components/ui/button';
	import * as HoverCard from '$lib/components/ui/hover-card';
	import type { Citation } from '$lib/chat';

	let { md, citations = [] }: { md: string; citations?: Citation[] } = $props();

	const plugins = [gfmPlugin(), citationPlugin];

	// Replies can be steered by notes and manuals the model reads, so links only go to the web, mail
	// or this app, never javascript: and the like.
	const safeHref = (href: unknown) =>
		typeof href === 'string' && /^(https?:|mailto:|\/(?!\/))/i.test(href) ? href : undefined;

	// shortcut: when two manuals cited share a page number, the latest search wins; have the model
	// name the manual if that ever misleads.
	const citationFor = (page: number) => citations.findLast((c) => c.page === page);

	const pageHref = (c: Citation) => `/manuals/${c.manualId}?page=${c.page}&from=${c.equipmentId}`;
</script>

<div
	class="prose prose-sm max-w-none min-w-0 dark:prose-invert prose-headings:text-base prose-pre:whitespace-pre-wrap prose-table:block prose-table:overflow-x-auto"
>
	<Markdown {md} {plugins}>
		{#snippet a({ href, children })}
			{@const url = safeHref(href)}
			{#if url}
				<a
					href={url}
					{...url.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' }}
				>
					{@render children?.()}
				</a>
			{:else}
				{@render children?.()}
			{/if}
		{/snippet}
		<!-- Images would load on their own, and a URL can carry data out; show a link instead. -->
		{#snippet img({ src, alt })}
			{@const url = safeHref(src)}
			{#if url}<a href={url} target="_blank" rel="noopener noreferrer">{alt || url}</a>{/if}
		{/snippet}
		{#snippet cite(props)}
			{@const pages = String((props as Record<string, unknown>).dataPages ?? '').split(',')}
			{@const found = pages.map((p) => citationFor(Number(p))).filter((c) => c !== undefined)}
			<!-- Pages the model never read stay as text: there is nothing to show or link. -->
			{#if found.length}
				<span class="not-prose inline-flex gap-1 align-baseline">
					{#each found as c (c.page)}
						{@render citation(c)}
					{/each}
				</span>
			{:else}
				{@render props.children?.()}
			{/if}
		{/snippet}
	</Markdown>
</div>

{#snippet citation(c: Citation)}
	<HoverCard.Root openDelay={10} closeDelay={100}>
		<!-- A link too, since touch screens never hover: tapping opens the page. -->
		<HoverCard.Trigger>
			{#snippet child({ props })}
				<Button {...props} href={pageHref(c)} variant="secondary" size="xs">p. {c.page}</Button>
			{/snippet}
		</HoverCard.Trigger>
		<HoverCard.Content class="flex w-72 flex-col gap-1 text-sm">
			<div class="font-medium">{c.name} manual · page {c.page}</div>
			<p class="whitespace-pre-wrap text-muted-foreground">{c.excerpt}</p>
			<a
				href={pageHref(c)}
				class="text-xs text-muted-foreground underline-offset-4 hover:underline"
			>
				Open page {c.page}
			</a>
		</HoverCard.Content>
	</HoverCard.Root>
{/snippet}
