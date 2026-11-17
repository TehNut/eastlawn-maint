<script lang="ts">
	import CurrentPhotos from '$lib/components/app/CurrentPhotos.svelte';
	import LogForm from '$lib/components/app/LogForm.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';

	let { data, form } = $props();
</script>

<PageHeader title="Edit log" back="/equipment/{data.log.equipmentId}/logs/{data.log.id}" />
<main
	class="mx-auto flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] max-w-3xl flex-col gap-6 px-4 pt-4"
>
	<CurrentPhotos photos={data.log.photos} />
	<LogForm
		values={data.log}
		action="?/save"
		error={form?.error}
		confirmLower={!!form && 'confirmLower' in form && form.confirmLower === true}
		submitLabel="Save changes"
		meterUnit={data.log.equipment.meterUnit}
		jobs={data.log.equipment.serviceJobs}
	/>
</main>
