import { asc } from 'drizzle-orm';
import { location } from './db/schema';

// Every location, or only the user's own when they're restricted to one.
export async function loadLocations(locals: App.Locals) {
	const all = await locals.db
		.select({ id: location.id, name: location.name })
		.from(location)
		.orderBy(asc(location.name));
	const own = locals.user?.locationId;
	return own ? all.filter((l) => l.id === own) : all;
}
