<script lang="ts">
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		endpoint,
		payload = {},
		starters,
		intro,
		storageKey,
		pageHref,
		applyTo
	}: {
		endpoint: string;
		payload?: Record<string, unknown>;
		starters: string[];
		intro: string;
		// Keeps the conversation when the panel unmounts, for a chat that lives in a tab.
		storageKey?: string;
		pageHref?: (page: number) => string;
		// The equipment approved changes apply to. Without it there's nothing to approve.
		applyTo?: string;
	} = $props();

	type Message = {
		role: 'user' | 'assistant';
		content: string;
		pages?: number[];
		sources?: { id: string; name: string }[];
		manualPages?: { manualId: string; equipmentId: string; name: string; pages: number[] }[];
	};
	type Proposal = { tool: string; args: Record<string, unknown>; state: 'open' | 'busy' | 'done' };

	// /api/ask and /api/chat accept 40, and the oldest has to stay a user message.
	const MAX_HISTORY = 39;

	let messages = $state<Message[]>([]);
	let proposals = $state<Proposal[]>([]);
	let input = $state('');
	let busy = $state(false);
	let searching = $state('');
	let error = $state('');
	let end = $state<HTMLElement>();
	let restored = $state(false);

	const scrollDown = () => tick().then(() => end?.scrollIntoView({ block: 'end' }));

	onMount(() => {
		try {
			const saved = storageKey && sessionStorage.getItem(storageKey);
			if (saved) messages = (JSON.parse(saved) as Message[]).filter((m) => m.content);
		} catch {
			// Unavailable or corrupt storage just means starting a new chat.
		}
		restored = true;
		scrollDown();
	});

	$effect(() => {
		const saved = JSON.stringify(messages);
		if (!storageKey || !restored) return;
		try {
			sessionStorage.setItem(storageKey, saved);
		} catch {
			// The chat still works, it just won't survive leaving the tab.
		}
	});

	export function clear() {
		messages = [];
		proposals = [];
		error = '';
	}

	async function send(content: string) {
		content = content.trim();
		if (!content || busy) return;
		input = '';
		error = '';
		busy = true;
		messages.push({ role: 'user', content });
		const history = messages.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
		messages.push({ role: 'assistant', content: '' });
		proposals = [];
		const reply = messages[messages.length - 1];
		scrollDown();

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...payload, messages: history })
			});
			if (!response.ok || !response.body) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'Request failed');
			}
			const calls = await readStream(response.body, reply);
			proposals = calls.map(({ name, args }) => ({
				tool: name,
				args: JSON.parse(args || '{}'),
				state: 'open'
			}));
			if (proposals.length && !reply.content) reply.content = 'Here is the change I suggest:';
			if (!reply.content) throw new Error('No response from the model');
			scrollDown();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Request failed';
			if (!reply.content) messages.pop();
		} finally {
			busy = false;
			searching = '';
		}
	}

	async function apply(proposal: Proposal) {
		proposal.state = 'busy';
		error = '';
		const response = await fetch('/api/ask/apply', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ equipmentId: applyTo, tool: proposal.tool, args: proposal.args })
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => null)) as { message?: string } | null;
			error = body?.message ?? 'Could not apply the change';
			proposal.state = 'open';
			return;
		}
		proposal.state = 'done';
		await invalidateAll();
	}

	const TITLES: Record<string, string> = {
		update_equipment: 'Update equipment',
		add_maintenance_log: 'Add maintenance log'
	};

	// Events from the chat endpoints, one JSON value per `data:` line.
	async function readStream(body: ReadableStream<Uint8Array>, reply: Message) {
		const calls: { name: string; args: string }[] = [];
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return calls;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop()!;
			for (const line of lines) {
				if (!line.startsWith('data:')) continue;
				const event = JSON.parse(line.slice(5));
				if (event === 'done') return calls;
				if (event.error) throw new Error(event.error);
				if (event.searching) searching = event.searching;
				if (event.pages) reply.pages = event.pages;
				if (event.sources) reply.sources = event.sources;
				if (event.manualPages) reply.manualPages = event.manualPages;
				if (event.toolCall) calls.push(event.toolCall);
				if (event.text) {
					searching = '';
					reply.content += event.text;
				}
				scrollDown();
			}
		}
	}
</script>

<main class="mx-auto min-h-0 w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-4">
	{#if messages.length === 0}
		<p class="text-sm text-muted-foreground">{intro}</p>
		<div class="space-y-2">
			{#each starters as starter (starter)}
				<button
					type="button"
					class="block w-full rounded-xl border p-3 text-left text-sm active:bg-muted"
					onclick={() => send(starter)}
				>
					{starter}
				</button>
			{/each}
		</div>
	{/if}
	{#each messages as message, i (i)}
		<div
			class="max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap {message.role === 'user'
				? 'ml-auto bg-primary text-primary-foreground'
				: 'bg-muted'}"
		>
			{message.content || searching || '…'}
		</div>
		{#if message.pages?.length && pageHref}
			<div class="flex flex-wrap items-center gap-1.5 text-xs">
				<span class="text-muted-foreground">Manual:</span>
				{#each message.pages as page (page)}
					<a href={pageHref(page)} class="rounded-full border px-2.5 py-1.5 active:bg-muted">
						p. {page}
					</a>
				{/each}
			</div>
		{/if}
		{#each message.manualPages ?? [] as cited (cited.equipmentId)}
			<div class="flex flex-wrap items-center gap-1.5 text-xs">
				<span class="text-muted-foreground">{cited.name} manual:</span>
				{#each cited.pages as page (page)}
					<a
						href="/manuals/{cited.manualId}?page={page}&from={cited.equipmentId}"
						class="rounded-full border px-2.5 py-1.5 active:bg-muted"
					>
						p. {page}
					</a>
				{/each}
			</div>
		{/each}
		{#if message.sources?.length}
			<div class="flex flex-wrap items-center gap-1.5 text-xs">
				{#each message.sources as source (source.id)}
					<a
						href="/equipment/{source.id}"
						class="rounded-full border px-2.5 py-1.5 active:bg-muted"
					>
						{source.name}
					</a>
				{/each}
			</div>
		{/if}
	{/each}
	{#each proposals as proposal (proposal)}
		<div class="space-y-2 rounded-xl border p-3 text-sm">
			<p class="font-medium">{TITLES[proposal.tool] ?? proposal.tool}</p>
			<dl class="space-y-1">
				{#each Object.entries(proposal.args) as [field, value] (field)}
					<div>
						<dt class="text-xs text-muted-foreground">{field}</dt>
						<dd class="whitespace-pre-wrap">{String(value)}</dd>
					</div>
				{/each}
			</dl>
			{#if proposal.state === 'done'}
				<p role="status" class="text-muted-foreground">Applied.</p>
			{:else}
				<div class="flex gap-2">
					<Button
						class="h-11 flex-1"
						disabled={proposal.state === 'busy'}
						onclick={() => apply(proposal)}
					>
						Apply
					</Button>
					<Button
						variant="outline"
						class="h-11 flex-1"
						onclick={() => (proposals = proposals.filter((p) => p !== proposal))}
					>
						Dismiss
					</Button>
				</div>
			{/if}
		</div>
	{/each}
	{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
	<div bind:this={end}></div>
</main>

<form
	class="mx-auto w-full max-w-3xl border-t p-3"
	onsubmit={(e) => {
		e.preventDefault();
		send(input);
	}}
>
	<div class="flex items-end gap-2">
		<Textarea
			bind:value={input}
			rows={1}
			placeholder="Ask a question"
			aria-label="Question"
			class="max-h-32 min-h-11"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
					e.preventDefault();
					send(input);
				}
			}}
		/>
		<Button
			type="submit"
			size="icon"
			class="size-11 shrink-0"
			aria-label="Send"
			disabled={busy || !input.trim()}
		>
			<SendHorizontal class="size-5" />
		</Button>
	</div>
</form>
