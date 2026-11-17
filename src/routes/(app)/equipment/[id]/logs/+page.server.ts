import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { equipment, maintenanceLog } from '$lib/server/db/schema';
import { newestLogs } from '$lib/server/logs';
import { paginate } from '$lib/server/pagination';

// Location access is checked for every route under equipment/[id] in the handle hook.
export const load = ({ locals, params, url }) => ({
	page: (async () => {
		const item = await locals.db.query.equipment.findFirst({
			where: eq(equipment.id, params.id),
			columns: { id: true, name: true }
		});
		if (!item) error(404, 'Equipment not found');

		const logs = await paginate(url, {
			...newestLogs,
			size: 20,
			run: (page) =>
				locals.db.query.maintenanceLog.findMany({
					where: and(eq(maintenanceLog.equipmentId, item.id), page.where),
					orderBy: page.orderBy,
					limit: page.limit,
					extras: newestLogs.extras,
					with: { author: { columns: { name: true } }, photos: true }
				})
		});
		return { item, logs: logs.items, next: logs.next, prev: logs.prev };
	})()
});
