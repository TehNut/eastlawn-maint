<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Loading from '$lib/components/app/Loading.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { CARD_LINK, CARD_LIST } from '$lib/utils';
	import { Badge } from '$lib/components/ui/badge';

	let { data } = $props();
</script>

<PageHeader title="Users" back="/settings">
	{#snippet actions()}
		<a
			href="/users/new"
			aria-label="Add user"
			class="flex size-11 items-center justify-center rounded-full active:bg-muted"
		>
			<Plus class="size-6" />
		</a>
	{/snippet}
</PageHeader>

<main class="mx-auto max-w-3xl">
	<Loading data={data.users} id="users">
		{#snippet children(users)}
			<ul class="py-4 {CARD_LIST}">
				{#each users as person (person.id)}
					<li>
						<a href="/users/{person.id}" class="flex items-center gap-3 p-4 {CARD_LINK}">
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{person.name}</p>
								<p class="truncate text-sm text-muted-foreground">{person.email}</p>
								{#if person.locationName}
									<p class="truncate text-sm text-muted-foreground">{person.locationName} only</p>
								{/if}
							</div>
							{#if person.permissions.includes('admin')}
								<Badge variant="outline" class="text-muted-foreground">Admin</Badge>
							{:else}
								<span class="text-sm text-muted-foreground">
									{person.permissions.length}
									{person.permissions.length === 1 ? 'flag' : 'flags'}
								</span>
							{/if}
							<ChevronRight class="size-5 text-muted-foreground" />
						</a>
					</li>
				{/each}
			</ul>
		{/snippet}
	</Loading>
</main>
