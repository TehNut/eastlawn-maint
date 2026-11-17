// Rebuilds every item's stored due summary from its history. Run after migrating a database that
// already has data, or after changing the due rules in src/lib/schedule.ts. Stop the app first:
// only one process should have the database open.
//   bun run db:refresh-due
import { openDb } from '../src/lib/server/db';
import { equipment } from '../src/lib/server/db/schema';
import { refreshDue } from '../src/lib/server/schedule';

const db = await openDb();
const items = await db.select({ id: equipment.id }).from(equipment);
for (const { id } of items) await refreshDue(db, id);
console.log(`Refreshed ${items.length} items.`);
