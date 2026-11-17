<script lang="ts">
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Download from '@lucide/svelte/icons/download';
	import Search from '@lucide/svelte/icons/search';
	import { onDestroy, onMount, tick } from 'svelte';
	import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { loadPdfjs } from '$lib/pdf';
	import { CARD_LINK, CARD_LIST } from '$lib/utils';

	let { data } = $props();

	const MAX_SCALE = 2;
	const fileUrl = $derived(`/manuals/${data.item.id}/file`);

	let task: PDFDocumentLoadingTask | undefined;
	let pdf: PDFDocumentProxy | undefined;
	let observer: IntersectionObserver | undefined;
	let error = $state('');
	let aspect = $state(1.3);
	let ready = $state(false);
	let list = $state<HTMLElement>();
	const pageNumbers = $derived(Array.from({ length: data.item.pageCount }, (_, i) => i + 1));

	onMount(async () => {
		try {
			const pdfjs = await loadPdfjs();
			task = pdfjs.getDocument({ url: fileUrl, disableAutoFetch: true, disableStream: true });
			pdf = await task.promise;
			const first = await pdf.getPage(1);
			const { width, height } = first.getViewport({ scale: 1 });
			aspect = height / width;
			ready = true;
			await tick();
			// Only pages near the screen hold a canvas, so long manuals stay light on memory.
			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						const slot = entry.target as HTMLElement;
						if (entry.isIntersecting) render(slot);
						else slot.replaceChildren();
					}
				},
				{ rootMargin: '150% 0px' }
			);
			for (const slot of list!.children) observer.observe(slot);
		} catch {
			error = "This manual couldn't be opened.";
		}
	});

	onDestroy(() => {
		observer?.disconnect();
		void task?.destroy();
	});

	async function render(slot: HTMLElement) {
		if (!pdf || slot.childElementCount) return;
		const page = await pdf.getPage(Number(slot.dataset.page));
		const scale = (slot.clientWidth / page.getViewport({ scale: 1 }).width) * dpr();
		const viewport = page.getViewport({ scale });
		const canvas = document.createElement('canvas');
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		canvas.className = 'w-full';
		slot.replaceChildren(canvas);
		await page.render({ canvas, viewport }).promise.catch(() => {});
	}

	const dpr = () => Math.min(window.devicePixelRatio || 1, MAX_SCALE);

	function jump(page: number) {
		list?.children[page - 1]?.scrollIntoView({ block: 'start' });
	}

	// Derived so a search, which also changes `data`, doesn't re-trigger the jump.
	const startPage = $derived(data.page);
	$effect(() => {
		if (ready && startPage > 1) jump(startPage);
	});

	// The page at the top of the screen, below the header.
	function pageOnScreen() {
		const top = 72;
		for (const slot of list?.children ?? []) {
			if (slot.getBoundingClientRect().bottom > top)
				return Number((slot as HTMLElement).dataset.page);
		}
		return 1;
	}

	let saving = $state<{ page: number; label: string; job: string } | null>(null);
	let saveError = $state('');
	let busy = $state(false);
	function startSave() {
		const page = pageOnScreen();
		saving = { page, label: `Page ${page}`, job: '' };
		saveError = '';
	}

	function search(event: SubmitEvent) {
		event.preventDefault();
		const q = String(new FormData(event.currentTarget as HTMLFormElement).get('q') ?? '');
		const url = new URL(window.location.href);
		url.searchParams.set('q', q);
		goto(url.search, { keepFocus: true, noScroll: true });
	}
</script>

<PageHeader title={data.item.name} back={data.back}>
	{#snippet actions()}
		{#if data.owner && ready}
			<button
				type="button"
				aria-label="Save this page"
				class="flex size-11 items-center justify-center rounded-full active:bg-muted"
				onclick={startSave}
			>
				<Bookmark class="size-5" />
			</button>
		{/if}
		<a
			href={fileUrl}
			aria-label="Open PDF"
			data-sveltekit-reload
			class="flex size-11 items-center justify-center rounded-full active:bg-muted"
		>
			<Download class="size-5" />
		</a>
	{/snippet}
</PageHeader>

<main class="mx-auto max-w-3xl">
	{#if data.item.chunkCount}
		<form class="relative p-3" onsubmit={search}>
			<Search class="absolute top-6 left-6 size-5 text-muted-foreground" />
			<Input
				type="search"
				name="q"
				value={data.q}
				placeholder="Search this manual"
				aria-label="Search this manual"
				class="pl-10"
			/>
		</form>
	{/if}

	{#if data.q}
		<ul class="py-2 text-sm {CARD_LIST}">
			{#each data.results as result, i (i)}
				<li>
					<button
						type="button"
						class="block w-full p-3 text-left {CARD_LINK}"
						onclick={() => jump(result.page)}
					>
						<span class="font-medium">Page {result.page}</span>
						<span class="line-clamp-2 text-muted-foreground">{result.text}</span>
					</button>
				</li>
			{:else}
				<li class="py-1 text-muted-foreground">No matches.</li>
			{/each}
		</ul>
	{/if}

	{#if error}
		<p role="alert" class="p-4 text-sm text-destructive">{error}</p>
	{/if}

	<div bind:this={list} class="space-y-2 bg-muted p-2">
		{#if ready}
			{#each pageNumbers as page (page)}
				<div
					data-page={page}
					aria-label="Page {page}"
					class="scroll-mt-16 overflow-hidden bg-white"
					style="aspect-ratio: 1 / {aspect}"
				></div>
			{/each}
		{/if}
	</div>
	{#if saving && data.owner}
		<form
			method="POST"
			action="?/bookmark"
			class="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl space-y-3 border-t bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					busy = false;
					if (result.type === 'success') {
						saving = null;
						toast.success(`Saved to ${data.owner?.name}`);
					} else if (result.type === 'failure') {
						saveError = String(result.data?.error ?? 'Could not save the page');
					} else await update();
				};
			}}
		>
			<p class="text-sm font-medium">Save page {saving.page} to {data.owner.name}</p>
			<input type="hidden" name="page" value={saving.page} />
			<input type="hidden" name="from" value={data.owner.id} />
			<Input
				name="label"
				aria-label="Label"
				placeholder="e.g. Replacing deck drive belt"
				maxlength={200}
				required
				bind:value={saving.label}
			/>
			{#if data.jobs.length}
				<SelectField
					name="serviceJobId"
					aria-label="Service job"
					options={[
						{ value: '', label: 'Not for a service job' },
						...data.jobs.map((j) => ({ value: j.id, label: j.name }))
					]}
					bind:value={saving.job}
				/>
			{/if}
			<ErrorText message={saveError} />
			<div class="flex gap-2">
				<Button type="button" variant="ghost" class="h-11 flex-1" onclick={() => (saving = null)}>
					Cancel
				</Button>
				<Button type="submit" class="h-11 flex-1" disabled={busy}>
					{busy ? 'Saving…' : 'Save page'}
				</Button>
			</div>
		</form>
	{/if}

	{#if !ready && !error}
		<p class="p-4 text-center text-sm text-muted-foreground">Opening manual…</p>
	{/if}
</main>
