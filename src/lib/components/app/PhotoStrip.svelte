<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { pushState } from '$app/navigation';
	import { page } from '$app/state';

	type Photo = { id: string; caption?: string | null };
	let { photos, large = false }: { photos: Photo[]; large?: boolean } = $props();
	let dialog = $state<HTMLDialogElement>();
	// Open photos live in history state, so Back closes the lightbox. Ids are unique, so with
	// several strips on a page only the one holding the photo opens.
	const open = $derived(photos.find((p) => p.id === page.state.photo) ?? null);
	const show = (photo: Photo) => pushState('', { photo: photo.id });
	const hide = () => page.state.photo && history.back();

	// showModal makes the rest of the page inert and handles Escape and focus return natively.
	$effect(() => {
		if (open && !dialog?.open) dialog?.showModal();
		else if (!open && dialog?.open) dialog.close();
	});
</script>

{#if photos.length}
	<div class="-mx-4 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-4">
		{#each photos as photo (photo.id)}
			<button
				type="button"
				aria-label={photo.caption ? `View photo: ${photo.caption}` : 'View photo'}
				class="shrink-0 snap-center overflow-hidden rounded-lg bg-muted"
				onclick={() => show(photo)}
			>
				<img
					src="/images/{photo.id}"
					alt={photo.caption ?? ''}
					loading="lazy"
					class="object-cover {large ? 'h-56 w-80 max-w-[85vw]' : 'size-20'}"
				/>
			</button>
		{/each}
	</div>
{/if}

<dialog
	bind:this={dialog}
	onclose={hide}
	aria-label={open?.caption || 'Photo'}
	class="m-0 size-full max-h-none max-w-none border-0 bg-black p-0 open:flex open:items-center open:justify-center"
>
	{#if open}
		<img
			src="/images/{open.id}"
			alt={open.caption ?? ''}
			class="max-h-full max-w-full object-contain"
		/>
		{#if open.caption}
			<p
				class="absolute inset-x-0 bottom-0 bg-black/70 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-sm text-white"
			>
				{open.caption}
			</p>
		{/if}
		<button
			type="button"
			aria-label="Close"
			class="absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 flex size-11 items-center justify-center rounded-full bg-white/15 text-white"
			onclick={hide}
		>
			<X class="size-6" />
		</button>
	{/if}
</dialog>
