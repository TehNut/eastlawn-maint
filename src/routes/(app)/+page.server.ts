import { env } from '$env/dynamic/private';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { statusValues, type Status } from '$lib/constants';
import { inUserLocation } from '$lib/server/access';
import { equipment, location, photo } from '$lib/server/db/schema';
import { equipmentMatches, retiredLast } from '$lib/server/equipment';
import { paginate } from '$lib/server/pagination';
import { appToday } from '$lib/server/schedule';
import { itemFlag } from '$lib/schedule';
import { loadLocations } from '$lib/server/locations';

export const load = async ({ locals, url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const locationId = url.searchParams.get('location') ?? '';
	const status = url.searchParams.get('status') ?? '';

	const where = and(
		inUserLocation(locals, equipment.locationId),
		q ? equipmentMatches(q) : undefined,
		locationId ? eq(equipment.locationId, locationId) : undefined,
		statusValues.includes(status as Status) ? eq(equipment.status, status as Status) : undefined
	);
	const locations = await loadLocations(locals);
	const today = appToday(env);
	// Streamed: the page and its filters render while the list loads.
	const list = paginate(url, {
		size: 30,
		// Retired last, then by name; matches equipment_list_idx.
		columns: [retiredLast, equipment.name, equipment.id],
		direction: 'asc',
		run: (page) =>
			locals.db
				.select({
					id: equipment.id,
					name: equipment.name,
					status: equipment.status,
					retired: sql<number>`${retiredLast}`,
					locationName: location.name,
					dueOn: equipment.dueOn,
					soonOn: equipment.soonOn,
					unloggedJobs: equipment.unloggedJobs,
					jobCount: equipment.jobCount,
					coverId: sql<string | null>`(
				SELECT ${photo.id} FROM ${photo}
				WHERE ${photo.equipmentId} = ${equipment.id} AND ${isNull(photo.logId)}
				ORDER BY ${photo.createdAt} LIMIT 1
			)`
				})
				.from(equipment)
				.innerJoin(location, eq(equipment.locationId, location.id))
				.where(and(where, page.where))
				.orderBy(...page.orderBy)
				.limit(page.limit),
		key: (item) => [item.retired, item.name, item.id]
	}).then((items) => ({
		// Only the worst states earn a chip, and never on retired items.
		items: items.items.map((item) => {
			const flag = item.status === 'retired' ? null : itemFlag(item, today);
			return { ...item, due: flag === 'due' || flag === 'due_soon' ? flag : null };
		}),
		next: items.next,
		prev: items.prev
	}));

	return {
		list,
		locations,
		q,
		locationId,
		status
	};
};
