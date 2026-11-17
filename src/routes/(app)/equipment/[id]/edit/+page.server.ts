import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, count, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { manualInUserLocation, requirePermission } from '$lib/server/access';
import type { Db } from '$lib/server/db';
import { equipment, maintenanceLog, manual, photo, serviceJob } from '$lib/server/db/schema';
import { attachTargets, checkAttachment } from '$lib/server/equipment';
import {
	parseEquipment,
	parseLogPresets,
	parseManualText,
	parseServiceJobs
} from '$lib/server/forms';
import { refreshDue, saveServiceJobs } from '$lib/server/schedule';
import { loadStandards } from '$lib/server/standards';
import { manualFileError, pruneManual, saveManual } from '$lib/server/manuals';
import {
	deletePhotoObjects,
	deletePhotos,
	savePhotoCaption,
	photoError,
	photoFiles,
	savePhotos
} from '$lib/server/photos';
import { loadLocations } from '$lib/server/locations';
import { bucket, type Bucket } from '$lib/server/storage';

async function linkManual(db: Db, bucket: Bucket, equipmentId: string, manualId: string | null) {
	const [item] = await db
		.select({ manualId: equipment.manualId })
		.from(equipment)
		.where(eq(equipment.id, equipmentId));
	await db.update(equipment).set({ manualId }).where(eq(equipment.id, equipmentId));
	if (item?.manualId !== manualId) await pruneManual(db, bucket, item?.manualId ?? null);
}

export const load = async ({ locals, params }) => {
	requirePermission(locals, 'equipment.update', 'equipment.delete');
	const item = await locals.db.query.equipment.findFirst({
		where: eq(equipment.id, params.id),
		with: {
			photos: { where: isNull(photo.logId), orderBy: [photo.createdAt] },
			manual: true,
			serviceJobs: { orderBy: [asc(serviceJob.sortOrder), asc(serviceJob.createdAt)] },
			attachments: { columns: { id: true, name: true } }
		}
	});
	if (!item) error(404, 'Equipment not found');
	return {
		item,
		parents: await attachTargets(locals, item.id),
		standards: await loadStandards(locals.db),
		// For the delete warning: everything that goes with the item.
		lost: {
			logs: (
				await locals.db
					.select({ n: count() })
					.from(maintenanceLog)
					.where(eq(maintenanceLog.equipmentId, item.id))
			)[0].n,
			photos: (
				await locals.db.select({ n: count() }).from(photo).where(eq(photo.equipmentId, item.id))
			)[0].n
		},
		locations: await loadLocations(locals),
		manuals: await locals.db
			.select({ id: manual.id, name: manual.name })
			.from(manual)
			.where(
				and(item.manualId ? ne(manual.id, item.manualId) : undefined, manualInUserLocation(locals))
			)
			.orderBy(asc(manual.name))
	};
};

export const actions = {
	save: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const form = await request.formData();
		const parsed = parseEquipment(form);
		if (!parsed.success) return fail(400, { error: parsed.error });
		const files = photoFiles(form);
		const photoProblem = photoError(files);
		if (photoProblem) return fail(400, { error: photoProblem });

		// Meter intervals need a meter, so the unit can't be removed from under them.
		if (!parsed.data.meterUnit) {
			const metered = await locals.db
				.select({ id: serviceJob.id })
				.from(serviceJob)
				.where(and(eq(serviceJob.equipmentId, params.id), isNotNull(serviceJob.meterEvery)))
				.limit(1);
			if (metered.length)
				return fail(400, {
					error: 'Some service jobs use meter intervals. Remove those intervals first.'
				});
		}

		// A restricted user can't move equipment somewhere they couldn't follow it.
		let locationId = locals.user!.locationId ?? parsed.data.locationId;
		if (parsed.data.attachedToId) {
			const attached = await checkAttachment(locals, params.id, parsed.data.attachedToId);
			if ('error' in attached) return fail(400, { error: attached.error });
			locationId = attached.locationId;
		}
		await locals.db
			.update(equipment)
			.set({ ...parsed.data, locationId })
			.where(eq(equipment.id, params.id));
		// A changed or removed meter changes what the readings mean for the schedule.
		await refreshDue(locals.db, params.id);
		// Attachments go where their parent goes.
		await locals.db
			.update(equipment)
			.set({ locationId })
			.where(eq(equipment.attachedToId, params.id));
		await savePhotos({ db: locals.db, bucket }, files, {
			equipmentId: params.id
		});
		redirect(303, `/equipment/${params.id}`);
	},

	deletePhoto: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const id = String((await request.formData()).get('photoId'));
		const owned = await locals.db
			.select({ id: photo.id })
			.from(photo)
			.where(and(eq(photo.id, id), eq(photo.equipmentId, params.id)));
		await deletePhotos(
			locals.db,
			bucket,
			owned.map((p) => p.id)
		);
	},

	captionPhoto: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		await savePhotoCaption(locals.db, await request.formData(), { equipmentId: params.id });
	},

	saveServiceJobs: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const parsed = parseServiceJobs(String((await request.formData()).get('jobs')));
		if (!parsed.success) return fail(400, { serviceError: parsed.error });
		const [item] = await locals.db
			.select({ meterUnit: equipment.meterUnit })
			.from(equipment)
			.where(eq(equipment.id, params.id));
		if (!item) error(404, 'Equipment not found');
		if (!item.meterUnit && parsed.data.some((j) => j.meterEvery))
			return fail(400, { serviceError: 'This item has no meter, so use calendar intervals.' });
		await saveServiceJobs(locals.db, params.id, parsed.data);
		await refreshDue(locals.db, params.id);
	},

	savePresets: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const parsed = parseLogPresets(String((await request.formData()).get('presets')));
		if (!parsed.success) return fail(400, { presetsError: parsed.error });
		await locals.db
			.update(equipment)
			.set({ logPresets: parsed.data })
			.where(eq(equipment.id, params.id));
	},

	uploadManual: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const form = await request.formData();
		const file = form.get('manual');
		if (!(file instanceof File)) return fail(400, { manualError: 'Choose a PDF' });
		const problem = manualFileError(file);
		if (problem) return fail(400, { manualError: problem });
		const text = parseManualText(String(form.get('text')));
		if (!text.success) return fail(400, { manualError: 'Could not read that PDF' });

		const id = await saveManual(
			{ db: locals.db, bucket },
			file,
			text.data.pages,
			text.data.pageCount
		);
		if (!id) return fail(400, { manualError: 'That file is not a PDF' });
		await linkManual(locals.db, bucket, params.id, id);
	},

	linkManual: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const id = String((await request.formData()).get('manualId'));
		const [found] = await locals.db
			.select({ id: manual.id })
			.from(manual)
			.where(and(eq(manual.id, id), manualInUserLocation(locals)));
		if (!found) return fail(400, { manualError: 'Choose a manual' });
		await linkManual(locals.db, bucket, params.id, id);
	},

	removeManual: async ({ locals, params }) => {
		requirePermission(locals, 'equipment.update');
		await linkManual(locals.db, bucket, params.id, null);
	},

	// The safer choice the delete dialog offers first: history and photos are kept.
	retire: async ({ locals, params }) => {
		requirePermission(locals, 'equipment.update');
		await locals.db.update(equipment).set({ status: 'retired' }).where(eq(equipment.id, params.id));
		redirect(303, `/equipment/${params.id}`);
	},

	delete: async ({ locals, params }) => {
		requirePermission(locals, 'equipment.delete');
		const [item] = await locals.db
			.select({ manualId: equipment.manualId })
			.from(equipment)
			.where(eq(equipment.id, params.id));
		// Read keys first: the rows disappear with the cascade.
		const photos = await locals.db
			.select({ id: photo.id })
			.from(photo)
			.where(eq(photo.equipmentId, params.id));
		await locals.db.delete(equipment).where(eq(equipment.id, params.id));
		await deletePhotoObjects(
			bucket,
			photos.map((p) => p.id)
		);
		await pruneManual(locals.db, bucket, item?.manualId ?? null);
		redirect(303, '/');
	}
};
