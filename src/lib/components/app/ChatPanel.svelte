<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MessageCircleDashed from '@lucide/svelte/icons/message-circle-dashed';
	import Search from '@lucide/svelte/icons/search';
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		applyEvent,
		finishReply,
		PROPOSAL_TEXT,
		type Citation,
		type ChatMessage,
		type EquipmentCard,
		type Part,
		type Reply
	} from '$lib/chat';
	import ChatMarkdown from './ChatMarkdown.svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Message from '$lib/components/ui/message';
	import * as MessageScroller from '$lib/components/ui/message-scroller';
	import * as Trace from '$lib/components/ui/trace';

	let {
		endpoint,
		payload = {},
		starters,
		intro,
		chat,
		applyTo
	}: {
		endpoint: string;
		payload?: Record<string, unknown>;
		starters: string[];
		intro: string;
		// The saved chat this page opened, if any.
		chat: {
			id: string;
			messages: ChatMessage[];
			equipment: Record<string, EquipmentCard>;
		} | null;
		// The equipment approved changes apply to. Without it there's nothing to approve.
		applyTo?: string;
	} = $props();

	type Proposal = { tool: string; args: Record<string, unknown>; state: 'open' | 'busy' | 'done' };

	let chatId = $state<string | null>(null);
	let messages = $state<ChatMessage[]>([]);
	// Items replies link to, by id, shown as chips.
	let equipment = $state<Record<string, EquipmentCard>>({});
	let proposals = $state<Proposal[]>([]);
	let input = $state('');
	let busy = $state(false);
	let error = $state('');
	// The reader's choice per reasoning row; until they click it follows whether it's still thinking.
	let reasoningOpen = $state<Record<string, boolean>>({});

	// Opening another chat, or a new one, replaces the conversation. The URL catching up with a chat
	// this panel just started doesn't.
	$effect.pre(() => {
		const id = chat?.id ?? null;
		untrack(() => {
			if (id === chatId) return;
			chatId = id;
			messages = chat?.messages ?? [];
			equipment = chat?.equipment ?? {};
			proposals = [];
			reasoningOpen = {};
			error = '';
		});
	});

	// The server started a chat for the first question: put it in the URL, so it survives a reload
	// and shows in the history.
	function started(id: string) {
		if (chatId === id) return;
		chatId = id;
		goto(`${page.url.pathname}?c=${id}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	async function send(content: string) {
		content = content.trim();
		if (!content || busy) return;
		input = '';
		error = '';
		busy = true;
		messages.push({ role: 'user', content });
		messages.push({ role: 'assistant', content: '', parts: [] });
		proposals = [];
		const reply = messages[messages.length - 1] as Reply;

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...payload, chatId, content })
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
			if (proposals.length && !reply.content) reply.content = PROPOSAL_TEXT;
			if (!reply.content) throw new Error('No response from the model');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Request failed';
			if (!reply.content) messages.pop();
		} finally {
			busy = false;
			finishReply(reply);
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

	// Every page the model read, grouped by manual, for the list under a reply.
	function byManual(citations: Citation[] = []) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not reactive state
		const groups = new Map<string, Citation & { pages: number[] }>();
		for (const c of citations) {
			const group =
				groups.get(c.manualId) ?? groups.set(c.manualId, { ...c, pages: [] }).get(c.manualId)!;
			group.pages.push(c.page);
		}
		for (const group of groups.values()) group.pages.sort((a, b) => a - b);
		return [...groups.values()];
	}

	// The lookup's main argument, such as the search terms, to show beside its label.
	const toolDetail = (args: Record<string, unknown>) =>
		Object.values(args).find((v): v is string => typeof v === 'string');

	// Events from the chat endpoints, one JSON value per `data:` line.
	async function readStream(body: ReadableStream<Uint8Array>, reply: Reply) {
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
				if (event.chat) started(event.chat);
				if (event.toolCall) calls.push(event.toolCall);
				if (event.equipment) Object.assign(equipment, event.equipment);
				applyEvent(reply, event);
			}
		}
	}
</script>

{#snippet reasoningRow(id: string, text: string, running: boolean)}
	<Trace.Collapsible
		open={reasoningOpen[id] ?? running}
		onOpenChange={(open) => (reasoningOpen[id] = open)}
	>
		<Trace.CollapsibleTrigger>
			<Trace.Line status={running ? 'running' : undefined}>
				<Trace.Icon>
					{#if running}<LoaderCircle class="animate-spin" />{:else}<CircleCheck />{/if}
				</Trace.Icon>
				<Trace.Title>{running ? 'Thinking' : 'Thought'}</Trace.Title>
			</Trace.Line>
		</Trace.CollapsibleTrigger>
		<Trace.CollapsibleContent class="whitespace-pre-wrap">{text}</Trace.CollapsibleContent>
	</Trace.Collapsible>
{/snippet}

{#snippet toolRow(part: Extract<Part, { type: 'tool' }>)}
	{@const detail = toolDetail(part.args)}
	{#snippet line()}
		<Trace.Line
			status={part.state === 'running' ? 'running' : part.state === 'error' ? 'error' : undefined}
		>
			<Trace.Icon>
				{#if part.state === 'running'}
					<LoaderCircle class="animate-spin" />
				{:else if part.state === 'error'}
					<CircleAlert />
				{:else}
					<Search />
				{/if}
			</Trace.Icon>
			<Trace.Title>{part.label.replace(/…$/, '')}</Trace.Title>
			{#if detail}<Trace.Description class="truncate">{detail}</Trace.Description>{/if}
		</Trace.Line>
	{/snippet}
	{#if part.output}
		<Trace.Collapsible>
			<Trace.CollapsibleTrigger>{@render line()}</Trace.CollapsibleTrigger>
			<Trace.CollapsibleContent class="max-h-64 overflow-y-auto text-xs whitespace-pre-wrap">
				{part.output}
			</Trace.CollapsibleContent>
		</Trace.Collapsible>
	{:else}
		{@render line()}
	{/if}
{/snippet}

<MessageScroller.Provider autoScroll>
	{#if messages.length === 0}
		<Empty.Root class="min-h-0 flex-1 overflow-y-auto">
			<Empty.Header>
				<Empty.Media variant="icon"><MessageCircleDashed /></Empty.Media>
				<Empty.Title>How can I help?</Empty.Title>
				<Empty.Description>{intro}</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				{#each starters as starter (starter)}
					<Button
						variant="outline"
						class="h-auto min-h-11 w-full justify-start text-left whitespace-normal"
						onclick={() => send(starter)}
					>
						{starter}
					</Button>
				{/each}
			</Empty.Content>
		</Empty.Root>
	{:else}
		<MessageScroller.Root class="min-h-0 flex-1">
			<MessageScroller.Viewport>
				<MessageScroller.Content aria-busy={busy} class="mx-auto w-full max-w-3xl gap-6 p-4">
					{#each messages as message, i (i)}
						{@const streaming = busy && i === messages.length - 1}
						<MessageScroller.Item messageId={String(i)} scrollAnchor={message.role === 'user'}>
							{#if message.role === 'user'}
								<Message.Root align="end">
									<Message.Content>
										<Bubble.Root align="end" variant="muted">
											<Bubble.Content class="whitespace-pre-wrap">{message.content}</Bubble.Content>
										</Bubble.Root>
									</Message.Content>
								</Message.Root>
							{:else}
								<Message.Root>
									<Message.Content class="gap-3">
										{#if message.parts?.length}
											<Trace.Root>
												{#each message.parts as part, p (p)}
													{#if part.type === 'reasoning'}
														{@render reasoningRow(
															`${i}-${p}`,
															part.text,
															streaming && !message.content && p === message.parts.length - 1
														)}
													{:else}
														{@render toolRow(part)}
													{/if}
												{/each}
											</Trace.Root>
										{:else if streaming && !message.content}
											<Trace.Root>
												<Trace.Line status="running">
													<Trace.Icon><LoaderCircle class="animate-spin" /></Trace.Icon>
													<Trace.Title>Working</Trace.Title>
												</Trace.Line>
											</Trace.Root>
										{/if}
										{#if message.content}
											<ChatMarkdown
												md={message.content}
												citations={message.citations}
												{equipment}
											/>
										{/if}
									</Message.Content>
								</Message.Root>
							{/if}
							{#each byManual(message.citations) as cited (cited.manualId)}
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
						</MessageScroller.Item>
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
				</MessageScroller.Content>
			</MessageScroller.Viewport>
			<MessageScroller.Button />
		</MessageScroller.Root>
	{/if}
</MessageScroller.Provider>

<form
	class="mx-auto w-full max-w-3xl p-3"
	onsubmit={(e) => {
		e.preventDefault();
		send(input);
	}}
>
	<InputGroup.Root>
		<InputGroup.Textarea
			bind:value={input}
			placeholder="Ask a question"
			aria-label="Question"
			class="max-h-40 min-h-14"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
					e.preventDefault();
					send(input);
				}
			}}
		/>
		<InputGroup.Addon align="block-end" class="pt-1">
			<InputGroup.Button
				type="submit"
				variant="default"
				size="icon-sm"
				class="ml-auto size-9 rounded-full"
				aria-label="Send"
				disabled={busy || !input.trim()}
			>
				<ArrowUp />
			</InputGroup.Button>
		</InputGroup.Addon>
	</InputGroup.Root>
</form>
