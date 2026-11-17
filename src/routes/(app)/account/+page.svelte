<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { authClient, signOut } from '$lib/auth-client';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { can } from '$lib/permissions';

	let { data } = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let error = $state('');
	let changed = $state(false);

	async function changePassword(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		changed = false;
		const result = await authClient.changePassword({
			currentPassword,
			newPassword,
			revokeOtherSessions: true
		});
		if (result.error) {
			error = result.error.message ?? 'Something went wrong';
			return;
		}
		changed = true;
		currentPassword = newPassword = '';
	}
</script>

{#snippet link(href: string, label: string)}
	<a {href} class="flex items-center justify-between p-3 font-medium active:bg-muted">
		{label}
		<ChevronRight class="size-5 text-muted-foreground" />
	</a>
{/snippet}

<PageHeader title="Account" />
<main class="mx-auto max-w-3xl space-y-6 p-4">
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<p class="truncate font-medium">{data.user.name}</p>
			<p class="truncate text-sm text-muted-foreground">{data.user.email}</p>
		</div>
		<Button variant="destructive" class="h-10 shrink-0 px-4" onclick={signOut}>Sign out</Button>
	</div>

	{#if can(data.user, 'users.create')}
		<div class="divide-y rounded-xl border text-sm">
			{@render link('/settings', 'App settings')}
		</div>
	{/if}

	<div class="space-y-1.5">
		<Label for="theme">Appearance</Label>
		<SelectField
			id="theme"
			options={[
				{ value: 'system', label: 'System' },
				{ value: 'light', label: 'Light' },
				{ value: 'dark', label: 'Dark' }
			]}
			value={userPrefersMode.current}
			onchange={setMode}
		/>
	</div>

	<form onsubmit={changePassword} class="space-y-3">
		<h2 class="font-semibold">Change password</h2>
		<div class="space-y-1.5">
			<Label for="current">Current password</Label>
			<Input
				id="current"
				type="password"
				bind:value={currentPassword}
				required
				autocomplete="current-password"
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="new">New password</Label>
			<Input
				id="new"
				type="password"
				bind:value={newPassword}
				required
				minlength={8}
				autocomplete="new-password"
			/>
		</div>
		<ErrorText message={error} />
		{#if changed}<p role="status" class="text-sm text-muted-foreground">Password changed.</p>{/if}
		<Button type="submit" variant="outline" class="h-11 w-full">Change password</Button>
	</form>
</main>
