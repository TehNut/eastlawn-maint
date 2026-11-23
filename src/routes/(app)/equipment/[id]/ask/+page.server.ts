import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { inUserLocation, requirePermission } from '$lib/server/access';
import { deleteChat, loadChat, recentChats } from '$lib/server/chats';
import { equipment } from '$lib/server/db/schema';

const findItem = (locals: App.Locals, id: string) =>
	locals.db.query.equipment.findFirst({
		where: and(eq(equipment.id, id), inUserLocation(locals, equipment.locationId)),
		columns: { id: true, name: true }
	});

export const load = async ({ locals, params, url }) => {
	requirePermission(locals, 'ai.use');
	const item = await findItem(locals, params.id);
	if (!item) error(404, 'Equipment not found');
	const [chats, chat] = await Promise.all([
		recentChats(locals, item.id),
		loadChat(locals, item.id, url.searchParams.get('c'))
	]);
	return { item, chats, chat };
};

export const actions = {
	delete: async ({ locals, params, request }) => {
		requirePermission(locals, 'ai.use');
		await deleteChat(locals, params.id, String((await request.formData()).get('id') ?? ''));
		redirect(303, `/equipment/${params.id}/ask`);
	}
};
