import { and, eq, inArray } from 'drizzle-orm';
import { equipmentHere, logInUserLocation } from '$lib/server/access';
import { logTypeValues, type LogType } from '$lib/constants';
import { maintenanceLog } from '$lib/server/db/schema';
import { newestLogs } from '$lib/server/logs';
import { paginate } from '$lib/server/pagination';
import { loadLocations } from '$lib/server/locations';

export const load = async ({ locals, url }) => {
	const locationId = url.searchParams.get('location') ?? '';
	const rawType = url.searchParams.get('type') ?? '';
	const type = logTypeValues.includes(rawType as LogType) ? (rawType as LogType) : '';

	// Both apply: the filter narrows what a restricted user sees, it never replaces it.
	const where = and(
		logInUserLocation(locals),
		locationId ? inArray(maintenanceLog.equipmentId, equipmentHere(locals, locationId)) : undefined,
		type ? eq(maintenanceLog.type, type) : undefined
	);
	const list = paginate(url, {
		...newestLogs,
		size: 30,
		run: (page) =>
			locals.db.query.maintenanceLog.findMany({
				where: and(where, page.where),
				orderBy: page.orderBy,
				limit: page.limit,
				extras: newestLogs.extras,
				with: {
					author: { columns: { name: true } },
					equipment: { columns: { name: true } },
					photos: true
				}
			})
	}).then((logs) => ({ logs: logs.items, next: logs.next, prev: logs.prev }));

	return {
		list,
		locations: await loadLocations(locals),
		locationId,
		type
	};
};
