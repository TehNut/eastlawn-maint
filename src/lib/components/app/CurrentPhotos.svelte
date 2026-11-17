<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	// Expects ?/deletePhoto and ?/captionPhoto actions on the page.
	let { photos }: { photos: { id: string; caption: string | null }[] } = $props();
</script>

{#if photos.length}
	<div class="space-y-1.5">
		<Label>Current photos</Label>
		<ul class="space-y-2">
			{#each photos as photo (photo.id)}
				<li class="flex items-center gap-2">
					<img
						src="/images/{photo.id}"
						alt={photo.caption ?? ''}
						class="size-14 shrink-0 rounded-lg bg-muted object-cover"
					/>
					<!-- Saves when the field loses focus, so there's no extra button per photo. -->
					<form
						method="POST"
						action="?/captionPhoto"
						class="min-w-0 flex-1"
						use:enhance={() =>
							async ({ result, update }) => {
								await update({ reset: false });
								if (result.type === 'success') toast.success('Caption saved');
							}}
					>
						<input type="hidden" name="photoId" value={photo.id} />
						<Input
							name="caption"
							aria-label="Caption"
							placeholder="Caption"
							maxlength={300}
							value={photo.caption ?? ''}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						/>
					</form>
					<form method="POST" action="?/deletePhoto" use:enhance>
						<input type="hidden" name="photoId" value={photo.id} />
						<button
							aria-label="Delete photo"
							class="flex size-11 items-center justify-center rounded-full active:bg-muted"
						>
							<X class="size-4" />
						</button>
					</form>
				</li>
			{/each}
		</ul>
	</div>
{/if}
