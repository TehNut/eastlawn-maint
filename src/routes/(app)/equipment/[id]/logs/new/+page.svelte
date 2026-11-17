<script lang="ts">
	import LogForm from '$lib/components/app/LogForm.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { can } from '$lib/permissions';

	let { data, form } = $props();
</script>

<PageHeader title="Add log" back="/equipment/{data.item.id}" />
<main
	class="mx-auto flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] max-w-3xl flex-col px-4 pt-4"
>
	<div class="mb-4">
		<p class="font-medium">{data.item.name}</p>
		<p class="text-sm text-muted-foreground">{data.item.location.name}</p>
	</div>
	<LogForm
		status={can(data.user, 'equipment.update') ? data.item.status : undefined}
		error={form?.error}
		confirmLower={!!form && 'confirmLower' in form && form.confirmLower === true}
		submitLabel="Save log"
		presets={data.presets}
		meterUnit={data.item.meterUnit}
		reading={data.reading}
		readingRequired
		jobs={data.item.serviceJobs}
		preselect={data.preselect}
		customizeHref={can(data.user, 'equipment.update')
			? `/equipment/${data.item.id}/edit#presets`
			: undefined}
	/>
</main>
