import { fail, redirect } from '@sveltejs/kit';
import { can, toPermissions } from '$lib/permissions';
import { requirePermission } from '$lib/server/access';
import { parseNewUser } from '$lib/server/forms';
import { chosenLocation, createUser } from '$lib/server/users';
import { loadLocations } from '$lib/server/locations';

export const load = async ({ locals }) => {
	requirePermission(locals, 'users.create');
	return {
		locations: can(locals.user, 'admin') ? await loadLocations(locals) : []
	};
};

export const actions = {
	default: async ({ request, locals }) => {
		requirePermission(locals, 'users.create');
		const form = await request.formData();
		const parsed = parseNewUser(form);
		if (!parsed.success) return fail(400, { error: parsed.error });

		// Only admins assign flags, so creating users can't be used to escalate.
		const isAdmin = can(locals.user, 'admin');
		const permissions = isAdmin ? toPermissions(form.getAll('permissions')) : [];
		// Inherited, or a restricted user could create an account that sees every location.
		const locationId = isAdmin
			? await chosenLocation(locals.db, form, permissions)
			: locals.user!.locationId;
		if (locationId === undefined) return fail(400, { error: 'Choose a valid location' });
		const created = await createUser(locals.auth, locals.db, parsed.data, permissions, locationId);
		if (!created) return fail(409, { error: 'That email is already in use' });
		redirect(303, isAdmin ? `/users/${created.id}` : '/settings');
	}
};
