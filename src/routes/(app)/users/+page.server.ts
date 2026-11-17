import { asc, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { location, user } from '$lib/server/db/schema';

export const load = ({ locals }) => {
	requirePermission(locals, 'admin');
	return {
		users: locals.db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				permissions: user.permissions,
				locationName: location.name
			})
			.from(user)
			.leftJoin(location, eq(user.locationId, location.id))
			.orderBy(asc(user.name))
	};
};
