import { error, type RequestEvent } from '@sveltejs/kit';
import { and, eq, inArray, type Column } from 'drizzle-orm';
import { can, type Permission } from '$lib/permissions';
import { equipment, maintenanceLog, manual, photo } from './db/schema';

// The real gate: hiding a button is cosmetic, every load and action must call this.
export function requirePermission(locals: App.Locals, ...any: Permission[]) {
	if (!any.some((permission) => can(locals.user, permission))) {
		error(403, 'You do not have permission to do this');
	}
}

// Conditions for queries that list things. Each is undefined, so matches everything, for users
// who aren't restricted to a location.
export function inUserLocation(locals: App.Locals, column: Column) {
	const locationId = locals.user?.locationId;
	return locationId ? eq(column, locationId) : undefined;
}

export const equipmentHere = (locals: App.Locals, locationId: string) =>
	locals.db
		.select({ id: equipment.id })
		.from(equipment)
		.where(eq(equipment.locationId, locationId));

export function logInUserLocation(locals: App.Locals) {
	const locationId = locals.user?.locationId;
	return locationId
		? inArray(maintenanceLog.equipmentId, equipmentHere(locals, locationId))
		: undefined;
}

// Manuals are shared between locations, so one is visible if anything here uses it.
export function manualInUserLocation(locals: App.Locals) {
	const locationId = locals.user?.locationId;
	return locationId
		? inArray(
				manual.id,
				locals.db
					.select({ id: equipment.manualId })
					.from(equipment)
					.where(eq(equipment.locationId, locationId))
			)
		: undefined;
}

async function routeInLocation({ locals, params, route }: RequestEvent, locationId: string) {
	const id = params.id ?? '';
	const under = (prefix: string) => route.id?.startsWith(prefix);

	if (under('/(app)/equipment/[id]') || under('/q/[id]')) {
		const found = await locals.db
			.select({ id: equipment.id })
			.from(equipment)
			.where(and(eq(equipment.id, id), eq(equipment.locationId, locationId)));
		return found.length > 0;
	}
	if (under('/(app)/manuals/[id]')) {
		const found = await locals.db
			.select({ id: manual.id })
			.from(manual)
			.where(and(eq(manual.id, id), manualInUserLocation(locals)));
		return found.length > 0;
	}
	if (under('/images/[id]')) {
		const found = await locals.db
			.select({ id: photo.id })
			.from(photo)
			.where(and(eq(photo.id, id), inArray(photo.equipmentId, equipmentHere(locals, locationId))));
		return found.length > 0;
	}
	// Fails closed: any other route with an id (or one of the above, renamed) is refused until
	// it is listed here. The admin-only users/ and locations/ pages never see restricted users.
	return !params.id;
}

// Runs from the handle hook because that sees loads, form actions and file routes alike, so a new
// page under these routes is covered without doing anything. Lists and request bodies have no
// id in the URL, so those use the conditions above. A 404 doesn't confirm the item exists.
export async function requireRouteInLocation(event: RequestEvent) {
	const locationId = event.locals.user?.locationId;
	if (locationId && !(await routeInLocation(event, locationId)))
		error(404, "That doesn't exist, or you don't have access to it.");
}
