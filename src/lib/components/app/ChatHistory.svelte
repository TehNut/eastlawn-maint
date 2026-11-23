<script lang="ts">
	import History from '@lucide/svelte/icons/history';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	let {
		chats,
		current,
		href
	}: {
		chats: { id: string; title: string; updatedAt: Date }[];
		current: string | null;
		// The chat page; a chat opens at ?c=<id>.
		href: string;
	} = $props();

	let confirming = $state(false);

	const when = (date: Date) =>
		date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		aria-label="Past chats"
		class="flex size-11 items-center justify-center rounded-full active:bg-muted"
	>
		<History class="size-5" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-72 max-w-[calc(100vw-2rem)]">
		{#if chats.length === 0}
			<DropdownMenu.Label class="font-normal text-muted-foreground"
				>No past chats</DropdownMenu.Label
			>
		{/if}
		{#each chats as chat (chat.id)}
			<DropdownMenu.Item
				class="min-h-11 {chat.id === current ? 'bg-muted' : ''}"
				onSelect={() => goto(`${href}?c=${chat.id}`)}
			>
				<span class="min-w-0 flex-1 truncate">{chat.title}</span>
				<span class="shrink-0 text-xs text-muted-foreground">{when(chat.updatedAt)}</span>
			</DropdownMenu.Item>
		{/each}
		{#if current}
			<DropdownMenu.Separator />
			<DropdownMenu.Item class="min-h-11 text-destructive" onSelect={() => (confirming = true)}>
				<Trash /> Delete this chat
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<a
	{href}
	aria-label="New chat"
	class="flex size-11 items-center justify-center rounded-full active:bg-muted"
>
	<SquarePen class="size-5" />
</a>

<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this chat?</AlertDialog.Title>
			<AlertDialog.Description>The conversation is removed for good.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() =>
					async ({ update }) => {
						confirming = false;
						await update();
					}}
			>
				<input type="hidden" name="id" value={current} />
				<Button type="submit" variant="destructive" class="w-full">Delete</Button>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
