import { redirect } from '@sveltejs/kit';
import { can } from '$lib/permissions';

// Printed labels point here, so the app's routes can change without reprinting them.
// Users who can't add logs get the item page instead.
export const load = ({ locals, params }) =>
	redirect(
		302,
		can(locals.user, 'log.create') ? `/equipment/${params.id}/logs/new` : `/equipment/${params.id}`
	);
