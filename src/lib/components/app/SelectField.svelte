<script lang="ts" generics="T extends string">
	import * as Select from '$lib/components/ui/select';

	let {
		value = $bindable(),
		options,
		id,
		name,
		required,
		placeholder,
		'aria-label': ariaLabel,
		onchange
	}: {
		value?: T;
		options: readonly { value: T; label: string }[];
		id?: string;
		name?: string;
		required?: boolean;
		placeholder?: string;
		'aria-label'?: string;
		onchange?: (value: T) => void;
	} = $props();

	const selected = $derived(options.find((option) => option.value === value));
</script>

<!-- Positions the hidden input here, so the browser's "required" bubble points at this field. -->
<div class="relative w-full min-w-0">
	<Select.Root
		type="single"
		{name}
		{required}
		bind:value={value as never}
		onValueChange={(next) => onchange?.(next as T)}
	>
		<Select.Trigger {id} aria-label={ariaLabel} class="w-full min-w-0">
			<span class="truncate">{selected?.label ?? placeholder}</span>
		</Select.Trigger>
		<Select.Content class="max-w-[calc(100vw-2rem)]">
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} class="min-h-11" />
			{/each}
		</Select.Content>
	</Select.Root>
</div>
