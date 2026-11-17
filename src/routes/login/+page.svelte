<script lang="ts">
	import { enhance } from '$app/forms';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { APP_NAME } from '$lib/constants';

	let { form } = $props();

	let busy = $state(false);
</script>

<main
	class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
>
	<div>
		<h1 class="text-2xl font-semibold">{APP_NAME}</h1>
		<p class="text-muted-foreground">Sign in to continue. Ask an admin for an account.</p>
	</div>
	<!-- Posts to this page's action, so it works before the JS loads; enhance takes over once it has. -->
	<form
		method="POST"
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
			<Label for="email">Email</Label>
			<Input
				id="email"
				name="email"
				type="email"
				value={form?.email ?? ''}
				required
				autocomplete="email"
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="password">Password</Label>
			<Input
				id="password"
				name="password"
				type="password"
				required
				autocomplete="current-password"
			/>
		</div>
		<ErrorText message={form?.error} />
		<Button type="submit" class="h-11 w-full" disabled={busy}>
			{busy ? 'One moment…' : 'Sign in'}
		</Button>
	</form>
</main>
