import { fail, redirect } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/access';
import { location, newId } from '$lib/server/db/schema';
import { parseLocation } from '$lib/server/forms';

export const load = ({ locals }) => {
	requirePermission(locals, 'admin');
};

export const actions = {
	save: async ({ request, locals }) => {
		requirePermission(locals, 'admin');
		const parsed = parseLocation(await request.formData());
		if (!parsed.success) return fail(400, { error: parsed.error });

		const id = newId();
		await locals.db.insert(location).values({ id, ...parsed.data });
		redirect(303, `/locations/${id}`);
	}
};
