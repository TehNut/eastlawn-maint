<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { DueState } from '$lib/schedule';

	// label, from dueLabel, says how far over or how soon; without it the chip names the state.
	let { state, label }: { state: DueState; label?: string } = $props();
	// Only problems get colour: bright for due, warm for soon, quiet otherwise.
	const look = {
		due: { text: 'Due', class: 'bg-destructive text-background' },
		due_soon: { text: 'Due soon', class: 'bg-warn/15 text-warn' },
		no_history: { text: 'No history', class: 'border-border text-muted-foreground' },
		not_due: { text: 'OK', class: 'border-border text-muted-foreground' }
	} as const;
</script>

<Badge variant="ghost" class="tabular-nums {look[state].class}">{label ?? look[state].text}</Badge>
