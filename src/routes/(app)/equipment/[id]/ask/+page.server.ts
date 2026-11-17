import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { equipment } from '$lib/server/db/schema';

export const load = async ({ locals, params }) => {
	requirePermission(locals, 'ai.use');
	const item = await locals.db.query.equipment.findFirst({
		where: eq(equipment.id, params.id),
		columns: { id: true, name: true, manualId: true }
	});
	if (!item) error(404, 'Equipment not found');
	return { item, manualId: item.manualId };
};
