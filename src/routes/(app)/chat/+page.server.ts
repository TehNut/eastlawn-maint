import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requirePermission } from '$lib/server/access';
import { deleteChat, loadChat, recentChats } from '$lib/server/chats';
import { appToday } from '$lib/server/schedule';

export const load = async ({ locals, url }) => {
	requirePermission(locals, 'ai.use');
	const [chats, chat] = await Promise.all([
		recentChats(locals, null),
		loadChat(locals, appToday(env), null, url.searchParams.get('c'))
	]);
	return { chats, chat };
};

export const actions = {
	delete: async ({ locals, request }) => {
		requirePermission(locals, 'ai.use');
		await deleteChat(locals, null, String((await request.formData()).get('id') ?? ''));
		redirect(303, '/chat');
	}
};
