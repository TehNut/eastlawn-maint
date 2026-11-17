<script lang="ts">
	import { enhance } from '$app/forms';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { APP_NAME } from '$lib/constants';

	let { form } = $props();
</script>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
	<div>
		<h1 class="text-2xl font-semibold">Set up {APP_NAME}</h1>
		<p class="text-muted-foreground">Create the first admin account.</p>
	</div>
	<form method="POST" use:enhance class="space-y-4">
		<div class="space-y-1.5">
			<Label for="token">Setup code</Label>
			<Input id="token" name="token" type="password" required autocomplete="off" />
		</div>
		<div class="space-y-1.5">
			<Label for="name">Name</Label>
			<Input id="name" name="name" required autocomplete="name" />
		</div>
		<div class="space-y-1.5">
			<Label for="email">Email</Label>
			<Input id="email" name="email" type="email" required autocomplete="email" />
		</div>
		<div class="space-y-1.5">
			<Label for="password">Password</Label>
			<Input
				id="password"
				name="password"
				type="password"
				required
				minlength={8}
				autocomplete="new-password"
			/>
		</div>
		<ErrorText message={form?.error} />
		<Button type="submit" class="h-11 w-full">Create admin</Button>
	</form>
</main>
