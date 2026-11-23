// A chat reply as it is streamed, shown and saved. The server and the browser both build it from
// the same events with applyEvent, so a saved chat reopens exactly as it was shown.
// Shared with the server's tests, so no $lib or platform imports here.

// A manual page the model read, so "(p. 12)" in the reply can link to it.
export type Citation = {
	manualId: string;
	equipmentId: string;
	// The equipment the manual belongs to.
	name: string;
	page: number;
	excerpt: string;
};

export type Source = { id: string; name: string };

// The steps taken before replying, in order.
export type Part =
	| { type: 'reasoning'; text: string }
	| {
			type: 'tool';
			id: string;
			label: string;
			args: Record<string, unknown>;
			output?: string;
			state: 'running' | 'done' | 'error';
	  };

export type Reply = {
	// The reply's text, which is all the model sees of it on later turns.
	content: string;
	parts: Part[];
	citations?: Citation[];
	sources?: Source[];
};

export type ChatMessage = { role: 'user' | 'assistant' } & Partial<Reply> & { content: string };

// Said when the model only proposed changes, so the reply isn't empty.
export const PROPOSAL_TEXT = 'Here is the change I suggest:';

export const emptyReply = (): Reply => ({ content: '', parts: [] });

// Folds one stream event into the reply. Events that aren't part of it (errors, proposals) are
// left to the caller.
export function applyEvent(reply: Reply, event: Record<string, unknown>) {
	if (typeof event.text === 'string') reply.content += event.text;
	if (typeof event.reasoning === 'string') {
		const last = reply.parts.at(-1);
		if (last?.type === 'reasoning') last.text += event.reasoning;
		else reply.parts.push({ type: 'reasoning', text: event.reasoning });
	}
	if (event.tool) {
		const tool = event.tool as { id: string; label: string; args: Record<string, unknown> };
		reply.parts.push({ type: 'tool', ...tool, state: 'running' });
	}
	if (event.toolDone) {
		const done = event.toolDone as { id: string; output: string };
		const part = reply.parts.find((p) => p.type === 'tool' && p.id === done.id);
		if (part?.type === 'tool') Object.assign(part, { output: done.output, state: 'done' });
	}
	if (event.citations) reply.citations = event.citations as Citation[];
	if (event.sources) reply.sources = event.sources as Source[];
}

// Once the stream ends, a lookup still running never finished.
export function finishReply(reply: Reply) {
	for (const part of reply.parts) {
		if (part.type === 'tool' && part.state === 'running') part.state = 'error';
	}
}
