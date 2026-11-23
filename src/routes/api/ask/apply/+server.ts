import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { inUserLocation, requirePermission } from '$lib/server/access';
import { equipment, maintenanceLog, newId } from '$lib/server/db/schema';
import { AiEquipmentPatch, AiLog, AiNewEquipment } from '$lib/server/forms';
import { loadLocations } from '$lib/server/locations';
import { appToday, readingProblem, refreshDue, syncLogReading } from '$lib/server/schedule';

const Body = z.discriminatedUnion('tool', [
	z.object({ tool: z.literal('create_equipment'), args: z.unknown() }),
	z.object({
		tool: z.enum(['update_equipment', 'add_maintenance_log']),
		equipmentId: z.string(),
		args: z.unknown()
	})
]);

// Runs a change the user approved in the chat. It re-checks everything: the proposal came from a
// model by way of the browser, so it gets no more trust than any other request.
export const POST = async ({ request, locals }) => {
	requirePermission(locals, 'ai.modify');
	const parsed = Body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid request');
	if (parsed.data.tool === 'create_equipment') return create(locals, parsed.data.args);
	const { equipmentId, tool, args } = parsed.data;

	const [item] = await locals.db
		.select({ id: equipment.id, meterUnit: equipment.meterUnit })
		.from(equipment)
		.where(and(eq(equipment.id, equipmentId), inUserLocation(locals, equipment.locationId)));
	if (!item) error(404, 'Not found');

	if (tool === 'update_equipment') {
		requirePermission(locals, 'equipment.update');
		const patch = AiEquipmentPatch.safeParse(args);
		if (!patch.success || !Object.keys(patch.data).length) error(400, 'Invalid change');
		await locals.db.update(equipment).set(patch.data).where(eq(equipment.id, equipmentId));
	} else {
		requirePermission(locals, 'log.create');
		const log = AiLog.safeParse(args);
		if (!log.success) error(400, 'Invalid log');
		const performedOn = log.data.performedOn ?? appToday(env);
		const meter = item.meterUnit ? (log.data.meterReading ?? null) : null;
		// Same rule as the add log page. A lower reading has to be confirmed there.
		const problem = await readingProblem(locals.db, item, {
			value: meter,
			date: performedOn,
			required: true,
			confirmed: false
		});
		if (problem)
			error(400, problem.confirmLower ? `${problem.error} Use Add log to confirm.` : problem.error);
		const id = newId();
		await locals.db.insert(maintenanceLog).values({
			id,
			equipmentId,
			authorId: locals.user!.id,
			type: log.data.type,
			description: log.data.description,
			performedOn,
			meterReading: meter
		});
		await syncLogReading(
			locals.db,
			{ id, equipmentId, meterReading: meter, performedOn },
			locals.user!.id
		);
		await refreshDue(locals.db, equipmentId);
	}
	return json({ ok: true });
};

async function create(locals: App.Locals, args: unknown) {
	requirePermission(locals, 'equipment.create');
	const parsed = AiNewEquipment.safeParse(args);
	if (!parsed.success) error(400, 'Invalid equipment');
	const { location, ...fields } = parsed.data;
	// Only the user's own locations, so a restricted user can't be steered into another one.
	const found = (await loadLocations(locals)).find((l) => l.name === location);
	if (!found) error(400, 'Choose one of your locations');
	const id = newId();
	await locals.db.insert(equipment).values({ id, ...fields, locationId: found.id });
	return json({ ok: true, id });
}
