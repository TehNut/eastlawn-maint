import { asc, count, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { equipment, location } from '$lib/server/db/schema';

export const load = ({ locals }) => {
	requirePermission(locals, 'admin');
	return {
		locations: locals.db
			.select({
				id: location.id,
				name: location.name,
				address: location.address,
				count: count(equipment.id)
			})
			.from(location)
			.leftJoin(equipment, eq(equipment.locationId, location.id))
			.groupBy(location.id)
			.orderBy(asc(location.name))
	};
};
