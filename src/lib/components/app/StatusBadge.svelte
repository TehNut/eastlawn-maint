<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { statusLabel } from '$lib/constants';

	let { status }: { status: string } = $props();
	// Active is the normal state, so it shows nothing; colour is kept for what needs attention.
	const looks: Record<string, string> = {
		needs_service: 'bg-warn/15 text-warn',
		out_of_service: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
		retired: 'border-border text-muted-foreground'
	};
</script>

{#if status !== 'active'}
	<Badge variant="ghost" class={looks[status] ?? 'border-border text-muted-foreground'}>
		{statusLabel(status)}
	</Badge>
{/if}
