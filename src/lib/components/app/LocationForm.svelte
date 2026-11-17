<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ErrorText from './ErrorText.svelte';

	let {
		values = {},
		error,
		submitLabel
	}: {
		values?: { name?: string; address?: string | null };
		error?: string;
		submitLabel: string;
	} = $props();
	let busy = $state(false);
</script>

<form
	method="POST"
	action="?/save"
	class="space-y-4"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<div class="space-y-1.5">
		<Label for="name">Name</Label>
		<Input id="name" name="name" required value={values.name ?? ''} />
	</div>
	<div class="space-y-1.5">
		<Label for="address">Address</Label>
		<Input id="address" name="address" value={values.address ?? ''} />
	</div>
	<ErrorText message={error} />
	<Button type="submit" class="h-11 w-full" disabled={busy}>{submitLabel}</Button>
</form>
