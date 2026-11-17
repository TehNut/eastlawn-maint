import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { equipment, maintenanceLog, photo, serviceJob } from '$lib/server/db/schema';
import { parseLog } from '$lib/server/forms';
import {
	deletePhotos,
	photoError,
	photoFiles,
	savePhotoCaption,
	savePhotos
} from '$lib/server/photos';
import { readingProblem, refreshDue, setLogJobs, syncLogReading } from '$lib/server/schedule';
import { bucket } from '$lib/server/storage';

const scope = (params: { id: string; logId: string }) =>
	and(eq(maintenanceLog.id, params.logId), eq(maintenanceLog.equipmentId, params.id));

export const load = async ({ locals, params }) => {
	requirePermission(locals, 'log.update');
	const log = await locals.db.query.maintenanceLog.findFirst({
		where: scope(params),
		with: {
			photos: true,
			serviceJobs: { columns: { serviceJobId: true } },
			equipment: {
				columns: { meterUnit: true },
				with: {
					serviceJobs: {
						columns: { id: true, name: true, consumables: true },
						orderBy: [asc(serviceJob.sortOrder), asc(serviceJob.createdAt)]
					}
				}
			}
		}
	});
	if (!log) error(404, 'Log not found');
	return { log: { ...log, serviceJobIds: log.serviceJobs.map((j) => j.serviceJobId) } };
};

export const actions = {
	save: async ({ request, locals, params }) => {
		requirePermission(locals, 'log.update');
		const form = await request.formData();
		const parsed = parseLog(form);
		if (!parsed.success) return fail(400, { error: parsed.error });
		const files = photoFiles(form);
		const photoProblem = photoError(files);
		if (photoProblem) return fail(400, { error: photoProblem });

		const [item] = await locals.db
			.select({ id: equipment.id, meterUnit: equipment.meterUnit })
			.from(equipment)
			.where(eq(equipment.id, params.id));
		if (!item) error(404, 'Equipment not found');
		// Status belongs to creating a log; editing history shouldn't change the equipment.
		const { type, summary, description, performedOn, meterReading, performedBy, partsUsed } =
			parsed.data;
		const fields = {
			type,
			summary,
			description,
			performedOn,
			meterReading,
			performedBy,
			partsUsed
		};
		// Not required here: older and imported logs may have no reading.
		const problem = await readingProblem(
			locals.db,
			item,
			{
				value: fields.meterReading,
				date: fields.performedOn,
				required: false,
				confirmed: form.has('confirmLower')
			},
			params.logId
		);
		if (problem) return fail(400, problem);

		const meter = item.meterUnit ? fields.meterReading : null;
		const updated = await locals.db
			.update(maintenanceLog)
			.set({ ...fields, meterReading: meter })
			.where(scope(params))
			.returning({ id: maintenanceLog.id });
		if (!updated.length) error(404, 'Log not found');

		await setLogJobs(locals.db, params.logId, params.id, parsed.data.serviceJobIds);
		await syncLogReading(
			locals.db,
			{
				id: params.logId,
				equipmentId: params.id,
				meterReading: meter,
				performedOn: fields.performedOn
			},
			locals.user!.id
		);
		await refreshDue(locals.db, params.id);
		await savePhotos({ db: locals.db, bucket }, files, {
			equipmentId: params.id,
			logId: params.logId
		});
		redirect(303, `/equipment/${params.id}/logs/${params.logId}`);
	},

	captionPhoto: async ({ request, locals, params }) => {
		requirePermission(locals, 'log.update');
		await savePhotoCaption(locals.db, await request.formData(), {
			equipmentId: params.id,
			logId: params.logId
		});
	},

	deletePhoto: async ({ request, locals, params }) => {
		requirePermission(locals, 'log.update');
		const id = String((await request.formData()).get('photoId'));
		const owned = await locals.db
			.select({ id: photo.id })
			.from(photo)
			.where(
				and(eq(photo.id, id), eq(photo.logId, params.logId), eq(photo.equipmentId, params.id))
			);
		await deletePhotos(
			locals.db,
			bucket,
			owned.map((p) => p.id)
		);
	}
};
