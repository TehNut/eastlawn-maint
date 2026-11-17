<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import ErrorText from '$lib/components/app/ErrorText.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import SelectField from '$lib/components/app/SelectField.svelte';
	import { Label } from '$lib/components/ui/label';
	import { can } from '$lib/permissions';

	let { data, form } = $props();

	let modelForm = $state<HTMLFormElement>();
</script>

{#snippet link(href: string, label: string)}
	<a {href} class="flex items-center justify-between p-3 font-medium active:bg-muted">
		{label}
		<ChevronRight class="size-5 text-muted-foreground" />
	</a>
{/snippet}

<PageHeader title="App settings" back="/account" />
<main class="mx-auto max-w-3xl space-y-6 p-4">
	<p class="text-sm text-muted-foreground">These apply to everyone using the app.</p>

	<div class="divide-y rounded-xl border text-sm">
		{#if can(data.user, 'admin')}
			{@render link('/users', 'Manage users')}
			{@render link('/locations', 'Manage locations')}
			{@render link('/standards', 'Product standards')}
			{@render link('/import', 'Import records')}
		{:else}
			{@render link('/users/new', 'Add user')}
		{/if}
	</div>

	{#if data.ai}
		<form
			bind:this={modelForm}
			method="POST"
			action="?/model"
			class="space-y-1.5"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') toast.success('AI model saved');
				}}
		>
			<Label for="model">AI model</Label>
			<SelectField
				id="model"
				name="model"
				options={data.ai.models.map((m) => ({ value: m, label: m }))}
				value={data.ai.model}
				onchange={() => tick().then(() => modelForm?.requestSubmit())}
			/>
			<p class="text-xs text-muted-foreground">Used for everyone's AI chats.</p>
			<ErrorText message={form?.error} />
		</form>
	{/if}
</main>
