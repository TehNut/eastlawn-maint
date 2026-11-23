import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { PROPOSAL_TEXT, type ChatMessage, type Reply } from '$lib/chat';
import { chat, chatMessage } from './db/schema';

// The model sees this many earlier messages. Older ones stay saved and shown, just not sent.
const HISTORY = 38;
const RECENT = 30;
const TITLE_LENGTH = 80;

// A user's chats are theirs alone; equipmentId keeps the general assistant's and each item's apart.
const owned = (locals: App.Locals, equipmentId: string | null) =>
	and(
		eq(chat.userId, locals.user!.id),
		equipmentId ? eq(chat.equipmentId, equipmentId) : isNull(chat.equipmentId)
	);

export const recentChats = (locals: App.Locals, equipmentId: string | null) =>
	locals.db
		.select({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt })
		.from(chat)
		.where(owned(locals, equipmentId))
		.orderBy(desc(chat.updatedAt))
		.limit(RECENT);

// A chat and its messages for the page, or null when it isn't this user's (or was deleted).
export async function loadChat(locals: App.Locals, equipmentId: string | null, id: string | null) {
	if (!id) return null;
	const [found] = await locals.db
		.select({ id: chat.id })
		.from(chat)
		.where(and(eq(chat.id, id), owned(locals, equipmentId)));
	if (!found) return null;
	const rows = await locals.db
		.select()
		.from(chatMessage)
		.where(eq(chatMessage.chatId, id))
		.orderBy(asc(chatMessage.id));
	const messages: ChatMessage[] = rows.map((m) => ({
		role: m.role,
		content: m.content,
		parts: m.parts ?? undefined,
		citations: m.citations ?? undefined,
		sources: m.sources ?? undefined
	}));
	return { id, messages };
}

// Continues a chat, or starts one, with a new question. Returns what the model should see, which
// comes from the database rather than the browser.
export async function addQuestion(
	locals: App.Locals,
	equipmentId: string | null,
	chatId: string | null,
	content: string
) {
	let id = chatId;
	if (id) {
		const [found] = await locals.db
			.select({ id: chat.id })
			.from(chat)
			.where(and(eq(chat.id, id), owned(locals, equipmentId)));
		if (!found) error(404, 'Chat not found');
	} else {
		const title = content.length > TITLE_LENGTH ? `${content.slice(0, TITLE_LENGTH)}…` : content;
		[{ id }] = await locals.db
			.insert(chat)
			.values({ userId: locals.user!.id, equipmentId, title })
			.returning({ id: chat.id });
	}
	const earlier = await locals.db
		.select({ role: chatMessage.role, content: chatMessage.content })
		.from(chatMessage)
		.where(eq(chatMessage.chatId, id!))
		.orderBy(desc(chatMessage.id))
		.limit(HISTORY);
	earlier.reverse();
	// Models want the conversation to open with a question.
	while (earlier[0]?.role === 'assistant') earlier.shift();
	await locals.db.insert(chatMessage).values({ chatId: id!, role: 'user', content });
	await touch(locals, id!);
	return { id: id!, history: [...earlier, { role: 'user' as const, content }] };
}

export async function saveReply(
	locals: App.Locals,
	chatId: string,
	reply: Reply,
	proposed: boolean
) {
	const content = reply.content || (proposed ? PROPOSAL_TEXT : '');
	// A reply that failed before saying anything isn't worth keeping; the question stays.
	if (!content) return;
	await locals.db.insert(chatMessage).values({
		chatId,
		role: 'assistant',
		content,
		parts: reply.parts.length ? reply.parts : null,
		citations: reply.citations ?? null,
		sources: reply.sources ?? null
	});
	await touch(locals, chatId);
}

const touch = (locals: App.Locals, id: string) =>
	locals.db
		.update(chat)
		.set({ updatedAt: sql`(unixepoch())` })
		.where(eq(chat.id, id));

export async function deleteChat(locals: App.Locals, equipmentId: string | null, id: string) {
	await locals.db.delete(chat).where(and(eq(chat.id, id), owned(locals, equipmentId)));
}
