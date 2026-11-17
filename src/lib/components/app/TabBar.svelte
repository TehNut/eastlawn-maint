<script lang="ts" generics="T extends string">
	// Segmented tabs. Panels are the page's own elements with id="tab-<value>"; keep them in the
	// DOM and toggle `hidden`, so unsaved edits survive switching tabs.
	let {
		tabs,
		value = $bindable()
	}: { tabs: readonly { value: T; label: string; short?: string }[]; value: T } = $props();
</script>

<div
	role="tablist"
	class="grid rounded-lg bg-muted p-1 text-sm font-medium"
	style="grid-template-columns: repeat({tabs.length}, minmax(0, 1fr))"
>
	{#each tabs as tab (tab.value)}
		<button
			type="button"
			role="tab"
			id="tabbtn-{tab.value}"
			aria-selected={value === tab.value}
			aria-controls="tab-{tab.value}"
			title={tab.label}
			class="truncate rounded-md px-2 py-1.5 {value === tab.value
				? 'bg-background shadow-sm'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => (value = tab.value)}
		>
			<!-- short, when given, is the phone label so tabs don't truncate. -->
			<span class="sm:hidden">{tab.short ?? tab.label}</span>
			<span class="max-sm:hidden">{tab.label}</span>
		</button>
	{/each}
</div>
