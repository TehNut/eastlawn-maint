<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import SelectField from './SelectField.svelte';

	let {
		locations,
		value = ''
	}: { locations: { id: string; name: string }[]; value?: string | null } = $props();
</script>

<div class="space-y-1.5">
	<Label for="locationId">Location access</Label>
	<SelectField
		id="locationId"
		name="locationId"
		options={[
			{ value: '', label: 'All locations' },
			...locations.map((l) => ({ value: l.id, label: l.name }))
		]}
		value={value ?? ''}
	/>
	<p class="text-xs text-muted-foreground">Admins always have access to every location.</p>
</div>
