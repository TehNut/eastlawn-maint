<script lang="ts">
	let { message }: { message?: string | null } = $props();
</script>

{#if message}
	<p role="alert" class="text-sm text-destructive">{message}</p>
{/if}
