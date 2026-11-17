<script lang="ts">
	import { enhance } from '$app/forms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';

	let {
		label,
		description,
		action = '?/delete',
		alternative
	}: {
		label: string;
		description: string;
		action?: string;
		// A safer action offered first, such as retiring instead of deleting.
		alternative?: { label: string; action: string };
	} = $props();
	let open = $state(false);
</script>

<Button variant="destructive" class="h-11 w-full" onclick={() => (open = true)}>{label}</Button>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{label}?</AlertDialog.Title>
			<AlertDialog.Description>{description}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				{action}
				use:enhance={() =>
					async ({ update }) => {
						open = false;
						await update();
					}}
			>
				<Button
					type="submit"
					variant={alternative ? 'outline' : 'destructive'}
					class="w-full {alternative ? 'text-destructive' : ''}">Delete</Button
				>
			</form>
			{#if alternative}
				<form
					method="POST"
					action={alternative.action}
					use:enhance={() =>
						async ({ update }) => {
							open = false;
							await update();
						}}
				>
					<Button type="submit" class="w-full">{alternative.label}</Button>
				</form>
			{/if}
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
