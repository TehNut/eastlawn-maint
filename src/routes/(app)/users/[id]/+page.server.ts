import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { toPermissions } from '$lib/permissions';
import { requirePermission } from '$lib/server/access';
import { user } from '$lib/server/db/schema';
import { parsePassword } from '$lib/server/forms';
import { chosenLocation, resetPassword } from '$lib/server/users';
import { loadLocations } from '$lib/server/locations';

export const load = async ({ locals, params }) => {
	requirePermission(locals, 'admin');
	const [person] = await locals.db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			permissions: user.permissions,
			locationId: user.locationId
		})
		.from(user)
		.where(eq(user.id, params.id));
	if (!person) error(404, 'User not found');
	return {
		person,
		isSelf: person.id === locals.user!.id,
		locations: await loadLocations(locals)
	};
};

export const actions = {
	save: async ({ request, locals, params }) => {
		requirePermission(locals, 'admin');
		const form = await request.formData();
		const permissions = toPermissions(form.getAll('permissions'));
		// Admins can't remove themselves, which guarantees one always remains.
		if (params.id === locals.user!.id && !permissions.includes('admin'))
			permissions.unshift('admin');
		const locationId = await chosenLocation(locals.db, form, permissions);
		if (locationId === undefined) return fail(400, { saveError: 'Choose a valid location' });
		await locals.db.update(user).set({ permissions, locationId }).where(eq(user.id, params.id));
		return { saved: true };
	},

	password: async ({ request, locals, params }) => {
		requirePermission(locals, 'admin');
		const parsed = parsePassword(await request.formData());
		if (!parsed.success) return fail(400, { passwordError: parsed.error });
		await resetPassword(locals.auth, params.id, parsed.data.password);
		// Resetting your own password also ends this session.
		if (params.id === locals.user!.id) redirect(303, '/login');
		return { passwordReset: true };
	},

	delete: async ({ locals, params }) => {
		requirePermission(locals, 'admin');
		if (params.id === locals.user!.id) return fail(400, { error: "You can't delete yourself" });
		await locals.db.delete(user).where(eq(user.id, params.id));
		redirect(303, '/users');
	}
};
