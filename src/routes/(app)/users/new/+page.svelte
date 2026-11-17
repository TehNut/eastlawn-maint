<script lang="ts">
	import { enhance } from '$app/forms';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import PermissionFields from '$lib/components/app/PermissionFields.svelte';
	import UserLocationField from '$lib/components/app/UserLocationField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { can } from '$lib/permissions';

	let { data, form } = $props();
	const isAdmin = $derived(can(data.user, 'admin'));
</script>

<PageHeader title="Add user" back={isAdmin ? '/users' : '/settings'} />
<main class="mx-auto max-w-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
	<form
		method="POST"
		use:enhance={() =>
			({ update }) =>
				update({ reset: false })}
		class="space-y-4"
	>
		<div class="space-y-1.5">
			<Label for="name">Name</Label>
			<Input id="name" name="name" required autocomplete="off" />
		</div>
		<div class="space-y-1.5">
			<Label for="email">Email</Label>
			<Input id="email" name="email" type="email" required autocomplete="off" />
		</div>
		<div class="space-y-1.5">
			<Label for="password">Temporary password</Label>
			<Input
				id="password"
				name="password"
				type="password"
				required
				minlength={8}
				autocomplete="new-password"
			/>
		</div>
		{#if isAdmin}
			<div class="space-y-1.5">
				<Label>Permissions</Label>
				<PermissionFields />
			</div>
			<UserLocationField locations={data.locations} />
		{:else}
			<p class="text-sm text-muted-foreground">
				New users have read-only access until an admin gives them permissions.
			</p>
		{/if}
		<ErrorText message={form?.error} />
		<Button type="submit" class="h-11 w-full">Add user</Button>
	</form>
</main>
