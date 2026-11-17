import { error, fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { DEFAULT_LOG_PRESETS } from '$lib/constants';
import { can } from '$lib/permissions';
import { currentReading } from '$lib/schedule';
import { equipment, maintenanceLog, newId, serviceJob } from '$lib/server/db/schema';
import { parseLog } from '$lib/server/forms';
import { photoError, photoFiles, savePhotos } from '$lib/server/photos';
import { readingProblem, refreshDue, setLogJobs, syncLogReading } from '$lib/server/schedule';
import { bucket } from '$lib/server/storage';

export const load = async ({ locals, params, url }) => {
	requirePermission(locals, 'log.create');
	const item = await locals.db.query.equipment.findFirst({
		where: eq(equipment.id, params.id),
		columns: { id: true, name: true, status: true, logPresets: true, meterUnit: true },
		with: {
			location: { columns: { name: true } },
			serviceJobs: {
				columns: { id: true, name: true, consumables: true },
				orderBy: [asc(serviceJob.sortOrder), asc(serviceJob.createdAt)]
			},
			readings: { columns: { value: true, readOn: true } }
		}
	});
	if (!item) error(404, 'Equipment not found');
	return {
		item,
		reading: currentReading(item.readings),
		presets: item.logPresets ?? DEFAULT_LOG_PRESETS,
		// From a job's "Log it" link on the item page.
		preselect: url.searchParams.getAll('job')
	};
};

export const actions = {
	default: async ({ request, locals, params }) => {
		requirePermission(locals, 'log.create');
		const form = await request.formData();
		const parsed = parseLog(form);
		if (!parsed.success) return fail(400, { error: parsed.error });
		const files = photoFiles(form);
		const photoProblem = photoError(files);
		if (photoProblem) return fail(400, { error: photoProblem });
		const { status, serviceJobIds, ...log } = parsed.data;

		const [item] = await locals.db
			.select({ id: equipment.id, meterUnit: equipment.meterUnit })
			.from(equipment)
			.where(eq(equipment.id, params.id));
		if (!item) error(404, 'Equipment not found');
		// The skill requires a reading on new logs for anything with a meter.
		const problem = await readingProblem(locals.db, item, {
			value: log.meterReading,
			date: log.performedOn,
			required: true,
			confirmed: form.has('confirmLower')
		});
		if (problem) return fail(400, problem);

		const id = newId();
		const meter = item.meterUnit ? log.meterReading : null;
		await locals.db.insert(maintenanceLog).values({
			id,
			equipmentId: params.id,
			authorId: locals.user!.id,
			...log,
			meterReading: meter
		});
		await setLogJobs(locals.db, id, params.id, serviceJobIds);
		await syncLogReading(
			locals.db,
			{ id, equipmentId: params.id, meterReading: meter, performedOn: log.performedOn },
			locals.user!.id
		);
		await refreshDue(locals.db, params.id);
		// The status field is only offered to users who may update equipment.
		if (status && can(locals.user, 'equipment.update')) {
			await locals.db.update(equipment).set({ status }).where(eq(equipment.id, params.id));
		}
		await savePhotos({ db: locals.db, bucket }, files, {
			equipmentId: params.id,
			logId: id
		});
		redirect(303, `/equipment/${params.id}`);
	}
};
