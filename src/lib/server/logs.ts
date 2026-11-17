import { sql } from 'drizzle-orm';
import { maintenanceLog } from './db/schema';

// Logs newest first: by the day the work was done, then when it was entered, then id. The
// Activity and history pages page through this order; log_recent_idx and log_equipment_idx
// match it, so a page stops after its rows.
export const newestLogs = {
	columns: [maintenanceLog.performedOn, maintenanceLog.createdAt, maintenanceLog.id],
	direction: 'desc' as const,
	// createdAt reads back as a Date; the cursor needs the stored seconds it's compared as.
	extras: { createdAtKey: sql<number>`${maintenanceLog.createdAt}`.as('created_at_key') },
	key: (log: { performedOn: string; createdAtKey: number; id: string }) => [
		log.performedOn,
		log.createdAtKey,
		log.id
	]
};
