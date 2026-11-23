import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { inUserLocation, requirePermission } from '$lib/server/access';
import { chatStream, excerpt } from '$lib/server/ai-chat';
import { aiTools, chatCompletion, systemPrompt } from '$lib/server/ai';
import { equipment, maintenanceLog } from '$lib/server/db/schema';
import { addQuestion, saveReply } from '$lib/server/chats';
import { ChatQuestion } from '$lib/server/forms';
import { searchManual } from '$lib/server/manuals';
import { currentModel } from '$lib/server/settings';

const Body = ChatQuestion.extend({ equipmentId: z.string() });

export const POST = async ({ request, locals }) => {
	requirePermission(locals, 'ai.use');
	const parsed = Body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid request');
	const { equipmentId, chatId, content } = parsed.data;

	const model = await currentModel(locals.db, env);
	if (!model || !env.CF_ACCOUNT_ID || !env.CF_AI_TOKEN) error(503, 'AI is not configured');

	const item = await locals.db.query.equipment.findFirst({
		where: and(eq(equipment.id, equipmentId), inUserLocation(locals, equipment.locationId)),
		with: {
			location: true,
			manual: { columns: { id: true, name: true, chunkCount: true } },
			logs: { orderBy: [desc(maintenanceLog.performedOn)], limit: 30 }
		}
	});
	if (!item) error(404, 'Not found');

	const manual = item.manual?.chunkCount ? item.manual : null;
	const { id, history } = await addQuestion(locals, item.id, chatId, content);
	const stream = chatStream({
		first: { chat: id },
		onFinish: (reply, proposed) => saveReply(locals, id, reply, proposed),
		complete: (history, tools) => chatCompletion(env, model, history, tools),
		lookups: manual
			? {
					search_manual: {
						label: 'Searching the manual…',
						run: async (args) => {
							const hits = await searchManual(locals.db, manual.id, String(args.query ?? ''));
							return {
								text: hits.length
									? hits.map((hit) => `[page ${hit.page}] ${hit.text}`).join('\n\n')
									: 'No matching passages.',
								citations: hits.map((hit) => ({
									manualId: manual.id,
									equipmentId: item.id,
									name: item.name,
									page: hit.page,
									excerpt: excerpt(hit.text)
								}))
							};
						}
					}
				}
			: {},
		messages: [{ role: 'system', content: systemPrompt(item) }, ...history],
		tools: aiTools(locals.user, !!manual)
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' }
	});
};
