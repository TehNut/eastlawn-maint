<script lang="ts">
	import { PERMISSIONS, type Permission } from '$lib/permissions';

	let { selected = [], locked = [] }: { selected?: Permission[]; locked?: Permission[] } = $props();
</script>

<fieldset class="divide-y rounded-xl border">
	<legend class="sr-only">Permissions</legend>
	{#each PERMISSIONS as permission (permission.value)}
		<label class="flex min-h-12 items-center gap-3 p-3">
			<input
				type="checkbox"
				name="permissions"
				value={permission.value}
				checked={selected.includes(permission.value)}
				disabled={locked.includes(permission.value)}
				class="size-5 shrink-0 accent-primary"
			/>
			<span class="min-w-0">
				<span class="block text-sm font-medium">{permission.label}</span>
				{#if permission.hint}
					<span class="block text-xs text-muted-foreground">{permission.hint}</span>
				{/if}
			</span>
		</label>
	{/each}
</fieldset>
