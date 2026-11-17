<script lang="ts">
	import LocationForm from '$lib/components/app/LocationForm.svelte';
	import PageHeader from '$lib/components/app/PageHeader.svelte';

	let { form } = $props();
</script>

<PageHeader title="Add location" back="/locations" />
<main class="mx-auto max-w-3xl p-4">
	<LocationForm error={form?.error} submitLabel="Add location" />
</main>
