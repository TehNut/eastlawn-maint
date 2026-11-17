<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDelete from '$lib/components/app/ConfirmDelete.svelte';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import PermissionFields from '$lib/components/app/PermissionFields.svelte';
	import UserLocationField from '$lib/components/app/UserLocationField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let { data, form } = $props();
</script>

<PageHeader title={data.person.name} back="/users" />
<main class="mx-auto max-w-3xl space-y-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
	<p class="text-sm text-muted-foreground">{data.person.email}</p>

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
		class="space-y-3"
	>
		<h2 class="font-semibold">Permissions</h2>
		<PermissionFields selected={data.person.permissions} locked={data.isSelf ? ['admin'] : []} />
		<UserLocationField locations={data.locations} value={data.person.locationId} />
		<ErrorText message={form?.saveError} />
		{#if form?.saved}<p role="status" class="text-sm text-muted-foreground">Saved.</p>{/if}
		<Button type="submit" class="h-11 w-full">Save permissions</Button>
	</form>

	<form method="POST" action="?/password" use:enhance class="space-y-3">
		<h2 class="font-semibold">Reset password</h2>
		<div class="space-y-1.5">
			<Label for="password">New password</Label>
			<Input
				id="password"
				name="password"
				type="password"
				required
				minlength={8}
				autocomplete="new-password"
			/>
		</div>
		<ErrorText message={form?.passwordError} />
		{#if form?.passwordReset}
			<p role="status" class="text-sm text-muted-foreground">
				Password changed. They've been signed out everywhere.
			</p>
		{/if}
		<Button type="submit" variant="outline" class="h-11 w-full">Reset password</Button>
	</form>

	{#if !data.isSelf}
		<ErrorText message={form?.error} />
		<ConfirmDelete
			label="Delete user"
			description="This removes {data.person
				.name}'s account and signs them out. Their logs stay, without an author."
		/>
	{/if}
</main>
