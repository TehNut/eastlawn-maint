<script lang="ts">
	import { onMount } from 'svelte';
	import ConfirmDelete from '$lib/components/app/ConfirmDelete.svelte';
	import CurrentPhotos from '$lib/components/app/CurrentPhotos.svelte';
	import EquipmentForm from '$lib/components/app/EquipmentForm.svelte';
	import LogPresetsSection from '$lib/components/app/LogPresetsSection.svelte';
	import ManualSection from '$lib/components/app/ManualSection.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import ServiceJobsSection from '$lib/components/app/ServiceJobsSection.svelte';
	import TabBar from '$lib/components/app/TabBar.svelte';
	import { DEFAULT_LOG_PRESETS } from '$lib/constants';
	import { can } from '$lib/permissions';

	let { data, form } = $props();
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
	const retirable = $derived(can(data.user, 'equipment.update') && data.item.status !== 'retired');

	const TABS = [
		{ value: 'details', label: 'Details' },
		{ value: 'service', label: 'Service schedule', short: 'Schedule' },
		{ value: 'presets', label: 'Presets' }
	] as const;
	type Tab = (typeof TABS)[number]['value'];
	let tab = $state<Tab>('details');

	// Links like /edit#service open that tab.
	onMount(() => {
		const hash = location.hash.slice(1);
		if (TABS.some((t) => t.value === hash)) tab = hash as Tab;
	});
	// A failed save shows the tab it came from.
	$effect(() => {
		if (form?.serviceError) tab = 'service';
		else if (form?.presetsError) tab = 'presets';
		else if (form?.error || form?.manualError) tab = 'details';
	});
</script>

<PageHeader title="Edit equipment" back="/equipment/{data.item.id}" />
<main class="mx-auto max-w-3xl space-y-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
	{#if can(data.user, 'equipment.update')}
		<TabBar tabs={TABS} bind:value={tab} />

		<div
			id="tab-details"
			role="tabpanel"
			aria-labelledby="tabbtn-details"
			hidden={tab !== 'details'}
		>
			<div class="space-y-6">
				<EquipmentForm
					locations={data.locations}
					values={data.item}
					error={form?.error}
					submitLabel="Save changes"
					parents={data.parents}
					attachments={data.item.attachments}
				>
					{#snippet currentPhotos()}
						<CurrentPhotos photos={data.item.photos} />
					{/snippet}
				</EquipmentForm>
				<ManualSection
					current={data.item.manual}
					manuals={data.manuals}
					error={form?.manualError}
				/>
				{@render remove()}
			</div>
		</div>

		<div
			id="tab-service"
			role="tabpanel"
			aria-labelledby="tabbtn-service"
			hidden={tab !== 'service'}
		>
			<ServiceJobsSection
				jobs={data.item.serviceJobs}
				meterUnit={data.item.meterUnit}
				standards={data.standards}
				error={form?.serviceError}
			/>
		</div>

		<div
			id="tab-presets"
			role="tabpanel"
			aria-labelledby="tabbtn-presets"
			hidden={tab !== 'presets'}
		>
			<LogPresetsSection
				presets={data.item.logPresets ?? DEFAULT_LOG_PRESETS}
				error={form?.presetsError}
			/>
		</div>
	{:else}
		{@render remove()}
	{/if}
</main>

{#snippet remove()}
	{#if can(data.user, 'equipment.delete')}
		<ConfirmDelete
			label="Delete equipment"
			description="This permanently removes {data.item.name}, {plural(
				data.lost.logs,
				'maintenance log'
			)} and {plural(data.lost.photos, 'photo')}. Printed QR labels will stop working.{retirable
				? ' Retiring keeps the history and takes it off the Due list.'
				: ''}"
			alternative={retirable ? { label: 'Retire instead', action: '?/retire' } : undefined}
		/>
	{/if}
{/snippet}
