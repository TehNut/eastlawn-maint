<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import X from '@lucide/svelte/icons/x';
	import { compressImage } from '$lib/image';

	// The id of the form to post with, when the picker sits outside it.
	let { form }: { form?: string } = $props();

	let input = $state<HTMLInputElement>();
	let files = $state.raw<{ file: File; url: string }[]>([]);
	let busy = $state(false);

	// The input is the source of truth for the form post, so keep it in sync with our list.
	function sync() {
		const transfer = new DataTransfer();
		for (const { file } of files) transfer.items.add(file);
		input!.files = transfer.files;
	}

	async function onchange() {
		const picked = [...(input!.files ?? [])];
		busy = true;
		const compressed = await Promise.all(picked.map(compressImage));
		files = [...files, ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) }))];
		busy = false;
		sync();
	}

	function remove(index: number) {
		URL.revokeObjectURL(files[index].url);
		files = files.filter((_, i) => i !== index);
		sync();
	}
</script>

<div class="flex flex-wrap gap-2">
	{#each files as { url }, i (url)}
		<div class="relative size-20 overflow-hidden rounded-lg bg-muted">
			<img src={url} alt="" class="size-full object-cover" />
			<button
				type="button"
				aria-label="Remove photo"
				class="absolute top-0.5 right-0.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
				onclick={() => remove(i)}
			>
				<X class="size-4" />
			</button>
		</div>
	{/each}
	<label
		class="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground active:bg-muted"
	>
		<Camera class="size-5" />
		{busy ? 'Adding…' : 'Add photo'}
		<input
			bind:this={input}
			{onchange}
			{form}
			type="file"
			name="photos"
			accept="image/*"
			multiple
			class="sr-only"
		/>
	</label>
</div>
