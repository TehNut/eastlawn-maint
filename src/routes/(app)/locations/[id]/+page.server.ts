import { error, fail, redirect } from '@sveltejs/kit';
import { asc, count, eq, isNull, sql } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { equipment, location, photo, user } from '$lib/server/db/schema';
import { retiredLast } from '$lib/server/equipment';
import { parseLocation } from '$lib/server/forms';

export const load = ({ locals, params }) => {
	requirePermission(locals, 'admin');
	return { page: page(locals, params.id) };
};

async function page(locals: App.Locals, id: string) {
	const [place] = await locals.db.select().from(location).where(eq(location.id, id));
	if (!place) error(404, 'Location not found');

	const items = await locals.db
		.select({
			id: equipment.id,
			name: equipment.name,
			status: equipment.status,
			coverId: sql<string | null>`(
				SELECT ${photo.id} FROM ${photo}
				WHERE ${photo.equipmentId} = ${equipment.id} AND ${isNull(photo.logId)}
				ORDER BY ${photo.createdAt} LIMIT 1
			)`
		})
		.from(equipment)
		.where(eq(equipment.locationId, id))
		.orderBy(retiredLast, asc(equipment.name));

	return { place, items };
}

export const actions = {
	save: async ({ request, locals, params }) => {
		requirePermission(locals, 'admin');
		const parsed = parseLocation(await request.formData());
		if (!parsed.success) return fail(400, { error: parsed.error });

		await locals.db.update(location).set(parsed.data).where(eq(location.id, params.id));
		return { saved: true };
	},

	delete: async ({ locals, params }) => {
		requirePermission(locals, 'admin');
		const [{ total }] = await locals.db
			.select({ total: count() })
			.from(equipment)
			.where(eq(equipment.locationId, params.id));
		if (total > 0) {
			return fail(409, { error: 'Move or delete the equipment here first.' });
		}
		const [{ restricted }] = await locals.db
			.select({ restricted: count() })
			.from(user)
			.where(eq(user.locationId, params.id));
		if (restricted > 0) {
			return fail(409, { error: 'Users are restricted to this location. Change them first.' });
		}
		await locals.db.delete(location).where(eq(location.id, params.id));
		redirect(303, '/locations');
	}
};
