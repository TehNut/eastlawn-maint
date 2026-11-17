<script lang="ts">
	import { tick } from 'svelte';
	import EquipmentForm from '$lib/components/app/EquipmentForm.svelte';
	import LogPresetsSection from '$lib/components/app/LogPresetsSection.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import ServiceJobsSection from '$lib/components/app/ServiceJobsSection.svelte';
	import TabBar from '$lib/components/app/TabBar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { DEFAULT_LOG_PRESETS } from '$lib/constants';

	let { data, form } = $props();

	const TABS = [
		{ value: 'details', label: 'Details' },
		{ value: 'service', label: 'Service schedule', short: 'Schedule' },
		{ value: 'presets', label: 'Presets' }
	] as const;
	let tab = $state<(typeof TABS)[number]['value']>('details');
	// The schedule editor follows the meter chosen under Details before anything is saved.
	let meterUnit = $state('');
	let busy = $state(false);

	// The browser can't point at a missing field on a hidden tab, so show Details first.
	async function checkDetails(event: MouseEvent) {
		const details = document.getElementById('equipment-form') as HTMLFormElement;
		if (details.checkValidity()) return;
		event.preventDefault();
		tab = 'details';
		await tick();
		details.reportValidity();
	}

	// A failed save shows the tab it came from.
	$effect(() => {
		if (form?.serviceError) tab = 'service';
		else if (form?.presetsError) tab = 'presets';
		else if (form?.error) tab = 'details';
	});
</script>

<!-- One form, id="equipment-form": the schedule and presets tabs submit with it through the
     form attribute, so everything is saved together by "Add equipment". -->
<PageHeader title="Add equipment" back="/" />
<main class="mx-auto max-w-3xl space-y-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
	<TabBar tabs={TABS} bind:value={tab} />

	<div id="tab-details" role="tabpanel" aria-labelledby="tabbtn-details" hidden={tab !== 'details'}>
		<EquipmentForm
			id="equipment-form"
			locations={data.locations}
			values={{ locationId: data.locationId }}
			error={form?.error}
			submitLabel="Add equipment"
			parents={data.parents}
			showSubmit={false}
			bind:busy
			onMeterUnit={(unit) => (meterUnit = unit)}
		/>
	</div>

	<div id="tab-service" role="tabpanel" aria-labelledby="tabbtn-service" hidden={tab !== 'service'}>
		<ServiceJobsSection
			jobs={[]}
			meterUnit={meterUnit || null}
			standards={data.standards}
			error={form?.serviceError}
			form="equipment-form"
		/>
	</div>

	<div id="tab-presets" role="tabpanel" aria-labelledby="tabbtn-presets" hidden={tab !== 'presets'}>
		<LogPresetsSection
			presets={DEFAULT_LOG_PRESETS}
			error={form?.presetsError}
			form="equipment-form"
		/>
	</div>

	<Button
		type="submit"
		form="equipment-form"
		class="h-11 w-full"
		disabled={busy}
		onclick={checkDetails}
	>
		{busy ? 'Saving…' : 'Add equipment'}
	</Button>
</main>
