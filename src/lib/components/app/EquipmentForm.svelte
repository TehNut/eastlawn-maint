<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		CATEGORIES,
		categoryOfKind,
		KINDS,
		METER_UNITS,
		STATUSES,
		type Category
	} from '$lib/constants';
	import ErrorText from './ErrorText.svelte';
	import PhotoPicker from './PhotoPicker.svelte';
	import SelectField from './SelectField.svelte';

	type Values = {
		name?: string;
		locationId?: string;
		status?: string;
		category?: string;
		meterUnit?: string | null;
		manufacturer?: string | null;
		model?: string | null;
		serialNumber?: string | null;
		kind?: string | null;
		year?: number | null;
		place?: string | null;
		operatorName?: string | null;
		attachedToId?: string | null;
		notes?: string | null;
	};

	let {
		locations,
		values = {},
		error,
		submitLabel,
		action = '?/save',
		parents = [],
		attachments = [],
		id,
		busy = $bindable(false),
		showSubmit = true,
		onMeterUnit,
		currentPhotos
	}: {
		locations: { id: string; name: string }[];
		// Items this one could be attached to.
		parents?: { id: string; name: string; locationId: string }[];
		// What's attached to this one. An item with attachments can't be attached itself.
		attachments?: { id: string; name: string }[];
		values?: Values;
		error?: string;
		submitLabel: string;
		action?: string;
		// For sections elsewhere on the page that submit with this form (form="<id>").
		id?: string;
		busy?: boolean;
		// False when the page puts the submit button outside, e.g. below its tabs.
		showSubmit?: boolean;
		onMeterUnit?: (unit: string) => void;
		// Shown with Add photos. Rendered outside the <form>, so it may hold forms of its own.
		currentPhotos?: Snippet;
	} = $props();
	const uid = $props.id();
	const formId = $derived(id ?? `equipment-${uid}`);
	let category = $state<Category>(untrack(() => (values.category as Category) ?? 'vehicle'));
	let kind = $state(untrack(() => values.kind ?? ''));
	let attachedToId = $state(untrack(() => values.attachedToId ?? ''));
	const parent = $derived(parents.find((p) => p.id === attachedToId));
	// Picking a known kind fills in its category, as in the skill.
	function onKind() {
		const match = categoryOfKind(kind.trim().toLowerCase());
		if (match) category = match;
	}
</script>

<div class="space-y-4">
	<form
		id={formId}
		method="POST"
		{action}
		enctype="multipart/form-data"
		class="space-y-4"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<div class="space-y-1.5">
			<Label for="name">Name</Label>
			<Input id="name" name="name" required value={values.name ?? ''} />
		</div>
		{#if attachments.length}
			<p class="text-sm text-muted-foreground">
				Attached: {attachments.map((a) => a.name).join(', ')}. They move with this item.
			</p>
		{:else if parents.length || attachedToId}
			<div class="space-y-1.5">
				<Label for="attachedToId">Attached to</Label>
				<SelectField
					id="attachedToId"
					name="attachedToId"
					options={[
						{ value: '', label: 'Not attached' },
						...parents.map((p) => ({ value: p.id, label: p.name }))
					]}
					bind:value={attachedToId}
				/>
			</div>
		{/if}
		{#if parent}
			<!-- The server sets this from the parent too; this only satisfies the required field. -->
			<input type="hidden" name="locationId" value={parent.locationId} />
			<p class="text-sm text-muted-foreground">
				Location follows {parent.name}:
				{locations.find((l) => l.id === parent.locationId)?.name ?? 'its location'}.
			</p>
		{:else}
			<div class="space-y-1.5">
				<Label for="locationId">Location</Label>
				<SelectField
					id="locationId"
					name="locationId"
					required
					placeholder="Choose a location"
					options={locations.map((l) => ({ value: l.id, label: l.name }))}
					value={values.locationId ?? ''}
				/>
			</div>
		{/if}
		<div class="space-y-1.5">
			<Label for="status">Status</Label>
			<SelectField id="status" name="status" options={STATUSES} value={values.status ?? 'active'} />
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1.5">
				<Label for="kind">Kind</Label>
				<Input
					id="kind"
					name="kind"
					list="kinds"
					maxlength={60}
					placeholder="e.g. tractor"
					bind:value={kind}
					onchange={onKind}
				/>
				<datalist id="kinds">
					{#each Object.values(KINDS).flat() as k (k)}<option value={k}></option>{/each}
				</datalist>
			</div>
			<div class="space-y-1.5">
				<Label for="category">Category</Label>
				<SelectField id="category" name="category" options={CATEGORIES} bind:value={category} />
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1.5">
				<Label for="place">Place</Label>
				<Input
					id="place"
					name="place"
					maxlength={200}
					placeholder="e.g. Shop bay 2"
					value={values.place ?? ''}
				/>
			</div>
			<div class="space-y-1.5">
				<Label for="meterUnit">Meter</Label>
				<SelectField
					id="meterUnit"
					name="meterUnit"
					options={[...METER_UNITS, { value: '', label: 'No meter' }]}
					value={values.meterUnit ?? ''}
					onchange={onMeterUnit}
				/>
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1.5">
				<Label for="manufacturer">Manufacturer</Label>
				<Input id="manufacturer" name="manufacturer" value={values.manufacturer ?? ''} />
			</div>
			<div class="space-y-1.5">
				<Label for="model">Model</Label>
				<Input id="model" name="model" value={values.model ?? ''} />
			</div>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div class="space-y-1.5">
				<Label for="serialNumber">Serial number</Label>
				<Input id="serialNumber" name="serialNumber" value={values.serialNumber ?? ''} />
			</div>
			<div class="space-y-1.5">
				<Label for="year">Year</Label>
				<Input
					id="year"
					name="year"
					type="number"
					inputmode="numeric"
					min={1900}
					max={2100}
					value={values.year ?? ''}
				/>
			</div>
		</div>
		<div class="space-y-1.5">
			<Label for="operatorName">Primary operator</Label>
			<Input
				id="operatorName"
				name="operatorName"
				maxlength={100}
				value={values.operatorName ?? ''}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="notes">Notes</Label>
			<Textarea id="notes" name="notes" rows={3} value={values.notes ?? ''} />
		</div>
	</form>
	<!-- After the form, posting with it via form=, so currentPhotos can contain forms. -->
	{@render currentPhotos?.()}
	<div class="space-y-1.5">
		<Label>Add photos</Label>
		<PhotoPicker form={formId} />
	</div>
	<ErrorText message={error} />
	{#if showSubmit}
		<Button type="submit" form={formId} class="h-11 w-full" disabled={busy}>
			{busy ? 'Saving…' : submitLabel}
		</Button>
	{/if}
</div>
