import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { inUserLocation, requirePermission } from '$lib/server/access';
import { chatStream } from '$lib/server/ai-chat';
import { chatCompletion, generalPrompt } from '$lib/server/ai';
import { generalLookups, generalTools } from '$lib/server/ai-lookups';
import { equipment, location } from '$lib/server/db/schema';
import { addQuestion, saveReply } from '$lib/server/chats';
import { ChatQuestion } from '$lib/server/forms';
import { appToday } from '$lib/server/schedule';
import { currentModel } from '$lib/server/settings';

// An item can take several steps: find it, read it, search its manual, then answer.
const MAX_ROUNDS = 5;
// Enough for a real inventory. Past this the prompt says to use find_equipment instead.
const INDEX_LIMIT = 300;

export const POST = async ({ request, locals }) => {
	requirePermission(locals, 'ai.use');
	const parsed = ChatQuestion.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid request');

	const model = await currentModel(locals.db, env);
	if (!model || !env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) error(503, 'AI is not configured');

	const rows = await locals.db
		.select({ id: equipment.id, name: equipment.name, location: location.name })
		.from(equipment)
		.innerJoin(location, eq(equipment.locationId, location.id))
		.where(inUserLocation(locals, equipment.locationId))
		.orderBy(asc(location.name), asc(equipment.name))
		.limit(INDEX_LIMIT + 1);

	const { id, history } = await addQuestion(locals, null, parsed.data.chatId, parsed.data.content);
	const stream = chatStream({
		first: { chat: id },
		onFinish: (reply, proposed) => saveReply(locals, appToday(env), id, reply, proposed),
		complete: (history, tools) => chatCompletion(env, model, history, tools),
		lookups: generalLookups(locals),
		messages: [
			{
				role: 'system',
				content: generalPrompt(
					locals.user!,
					rows.slice(0, INDEX_LIMIT),
					rows.length > INDEX_LIMIT,
					appToday(env)
				)
			},
			...history
		],
		tools: generalTools,
		maxRounds: MAX_ROUNDS
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }
	});
};
