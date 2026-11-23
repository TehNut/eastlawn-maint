// Shared with tests, so no $lib or platform imports here.
type ToolCall = { id: string; name: string; args: string };
type Message = Record<string, unknown>;
type Tool = { function: { name: string } };
import {
	applyEvent,
	emptyReply,
	finishReply,
	type Citation,
	type Reply,
	type Source
} from '../chat';

// A tool the server answers itself, so it must only read. Anything else the model calls goes to
// the browser as a proposal.
export type Lookup = {
	label: string;
	run: (
		args: Record<string, unknown>
	) => Promise<{ text: string; source?: Source; citations?: Citation[] }>;
};

// Enough of a passage to show what a citation says, in a hover card.
const EXCERPT_LENGTH = 280;
export const excerpt = (text: string) =>
	text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;

const SEARCH_TOOL = 'search_manual';
// Rounds of model calls per question; the last one must answer.
const MAX_ROUNDS = 3;
const MAX_LOOKUPS_PER_ROUND = 3;
// Enough of a lookup's result for the user to see what the model read, without shipping whole manuals.
const MAX_TOOL_OUTPUT = 2000;

export const searchTool = {
	type: 'function',
	function: {
		name: SEARCH_TOOL,
		description:
			"Keyword search of this equipment's operator manual. Returns the best matching passages with page numbers. Use the wording a manual would use; try different terms if nothing relevant comes back.",
		parameters: {
			type: 'object',
			properties: { query: { type: 'string', description: 'Search keywords' } },
			required: ['query'],
			additionalProperties: false
		}
	}
};

// Streams one model reply, passing text and reasoning through and collecting tool calls, which
// arrive in pieces.
async function readReply(
	body: ReadableStream<Uint8Array>,
	onText: (text: string) => void,
	onReasoning: (text: string) => void
) {
	const calls: ToolCall[] = [];
	let content = '';
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop()!;
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const payload = line.slice(5).trim();
			if (payload === '[DONE]') return { content, calls };
			const delta = JSON.parse(payload).choices?.[0]?.delta;
			// Providers differ on the field name for thinking tokens.
			const reasoning = delta?.reasoning_content ?? delta?.reasoning;
			if (typeof reasoning === 'string' && reasoning) onReasoning(reasoning);
			if (delta?.content) {
				content += delta.content;
				onText(delta.content);
			}
			for (const call of delta?.tool_calls ?? []) {
				const entry = (calls[call.index ?? 0] ??= { id: '', name: '', args: '' });
				entry.id ||= call.id ?? '';
				entry.name += call.function?.name ?? '';
				entry.args += call.function?.arguments ?? '';
			}
		}
	}
	return { content, calls };
}

function argsOf(call: ToolCall): Record<string, unknown> {
	try {
		return JSON.parse(call.args) ?? {};
	} catch {
		return {};
	}
}

// Runs the conversation, handling lookups here and streaming events to the browser. Lookup results
// only exist within this request: later turns see the reply's text, so they are never resent.
// `first` is sent before anything else. `onFinish` gets the whole reply, even if the browser left,
// and may return one last event to send.
export function chatStream({
	complete,
	lookups,
	messages,
	tools,
	maxRounds = MAX_ROUNDS,
	first,
	onFinish
}: {
	complete: (messages: Message[], tools: Tool[]) => Promise<Response>;
	lookups: Record<string, Lookup>;
	messages: Message[];
	tools: Tool[];
	maxRounds?: number;
	first?: Record<string, unknown>;
	onFinish?: (reply: Reply, proposed: boolean) => Promise<Record<string, unknown> | void>;
}) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const reply = emptyReply();
			let proposed = false;
			let open = true;
			const send = (event: Record<string, unknown> | 'done') => {
				if (event !== 'done') applyEvent(reply, event);
				if (!open) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					// The browser went away. Keep going so the reply is still saved.
					open = false;
				}
			};
			if (first) send(first);
			const sources = new Map<string, Source>();
			// First passage per manual page; later searches hitting the same page add nothing.
			const citations = new Map<string, Citation>();
			const history = [...messages];
			try {
				for (let round = 0; round < maxRounds; round++) {
					const last = round === maxRounds - 1;
					const offered = last ? tools.filter((t) => !lookups[t.function.name]) : tools;
					const response = await complete(history, offered);
					if (!response.ok || !response.body) {
						console.error('AI request failed', response.status, await response.text());
						send({ error: 'The AI service returned an error' });
						break;
					}
					const { content, calls } = await readReply(
						response.body,
						(text) => send({ text }),
						(reasoning) => send({ reasoning })
					);
					const reads = calls.filter((c) => lookups[c.name]).slice(0, MAX_LOOKUPS_PER_ROUND);

					if (!reads.length) {
						// Models can call tools they weren't offered, so only offered ones become proposals.
						for (const { name, args } of calls) {
							if (!tools.some((t) => t.function.name === name)) continue;
							proposed = true;
							send({ toolCall: { name, args } });
						}
						break;
					}

					history.push({
						role: 'assistant',
						content: content || null,
						tool_calls: reads.map((c) => ({
							id: c.id,
							type: 'function',
							function: { name: c.name, arguments: c.args }
						}))
					});
					for (const [i, call] of reads.entries()) {
						const lookup = lookups[call.name];
						const id = call.id || `${round}-${i}`;
						const args = argsOf(call);
						send({ tool: { id, label: lookup.label, args } });
						const result = await lookup.run(args);
						send({ toolDone: { id, output: result.text.slice(0, MAX_TOOL_OUTPUT) } });
						if (result.source) sources.set(result.source.id, result.source);
						const before = citations.size;
						for (const c of result.citations ?? []) {
							const key = `${c.manualId}:${c.page}`;
							if (!citations.has(key)) citations.set(key, c);
						}
						// Sent as they come, so citations in the reply link up while it streams.
						if (citations.size > before) send({ citations: [...citations.values()] });
						history.push({ role: 'tool', tool_call_id: call.id, content: result.text });
					}
				}
				if (sources.size) send({ sources: [...sources.values()] });
			} catch (e) {
				console.error('AI stream failed', e);
				send({ error: 'The AI request failed' });
			}
			finishReply(reply);
			try {
				const last = await onFinish?.(reply, proposed);
				if (last) send(last);
			} catch (e) {
				console.error('Saving the reply failed', e);
				send({ error: 'The reply could not be saved' });
			}
			send('done');
			if (open) controller.close();
		}
	});
}
