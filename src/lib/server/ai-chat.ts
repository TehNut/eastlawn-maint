// Shared with tests, so no $lib or platform imports here.

type ToolCall = { id: string; name: string; args: string };
type Message = Record<string, unknown>;
type Tool = { function: { name: string } };
type Source = { id: string; name: string };
// Pages cited from one item's manual, for the general assistant, which can search several.
type ManualPages = { manualId: string; equipmentId: string; name: string; pages: number[] };

// A tool the server answers itself, so it must only read. Anything else the model calls goes to
// the browser as a proposal.
export type Lookup = {
	label: string;
	run: (
		args: Record<string, unknown>
	) => Promise<{ text: string; pages?: number[]; source?: Source; manualPages?: ManualPages }>;
};

const SEARCH_TOOL = 'search_manual';
// Rounds of model calls per question; the last one must answer.
const MAX_ROUNDS = 3;
const MAX_LOOKUPS_PER_ROUND = 3;

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

// Streams one model reply, passing text through and collecting tool calls, which arrive in pieces.
async function readReply(body: ReadableStream<Uint8Array>, onText: (text: string) => void) {
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

// Runs the conversation, handling lookups here and streaming events to the browser. Results only
// exist within this request: the browser keeps plain text, so they are never resent on later
// questions.
export function chatStream({
	complete,
	lookups,
	messages,
	tools,
	maxRounds = MAX_ROUNDS
}: {
	complete: (messages: Message[], tools: Tool[]) => Promise<Response>;
	lookups: Record<string, Lookup>;
	messages: Message[];
	tools: Tool[];
	maxRounds?: number;
}) {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: unknown) =>
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			const pages = new Set<number>();
			const sources = new Map<string, Source>();
			const manualPages = new Map<string, ManualPages>();
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
					const { content, calls } = await readReply(response.body, (text) => send({ text }));
					const reads = calls.filter((c) => lookups[c.name]).slice(0, MAX_LOOKUPS_PER_ROUND);

					if (!reads.length) {
						// Models can call tools they weren't offered, so only offered ones become proposals.
						for (const { name, args } of calls) {
							if (tools.some((t) => t.function.name === name)) send({ toolCall: { name, args } });
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
					for (const call of reads) {
						const lookup = lookups[call.name];
						send({ searching: lookup.label });
						const result = await lookup.run(argsOf(call));
						result.pages?.forEach((page) => pages.add(page));
						if (result.source) sources.set(result.source.id, result.source);
						if (result.manualPages) {
							const seen = manualPages.get(result.manualPages.equipmentId);
							const pages = new Set([...(seen?.pages ?? []), ...result.manualPages.pages]);
							manualPages.set(result.manualPages.equipmentId, {
								...result.manualPages,
								pages: [...pages].sort((a, b) => a - b)
							});
						}
						history.push({ role: 'tool', tool_call_id: call.id, content: result.text });
					}
				}
				if (pages.size) send({ pages: [...pages].sort((a, b) => a - b) });
				if (sources.size) send({ sources: [...sources.values()] });
				if (manualPages.size) send({ manualPages: [...manualPages.values()] });
			} catch (e) {
				console.error('AI stream failed', e);
				send({ error: 'The AI request failed' });
			}
			send('done');
			controller.close();
		}
	});
}
