import { fail } from '@sveltejs/kit';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission } from '$lib/server/access';
import { chunksFor, type Db } from '$lib/server/db';
import {
	equipment,
	location,
	maintenanceLog,
	meterReading,
	newId,
	serviceJob
} from '$lib/server/db/schema';
import { parseJsonField as json, parseManualText } from '$lib/server/forms';
import { manualFileError, saveManual } from '$lib/server/manuals';
import { photoError, photoFiles, savePhotos } from '$lib/server/photos';
import { refreshDue, setLogJobs, syncLogReading } from '$lib/server/schedule';
import { EquipmentImport, LogImport } from '$lib/records';
import { loadLocations } from '$lib/server/locations';
import { bucket } from '$lib/server/storage';

// One record per request, sent by the page in order: equipment, then manuals, then logs. Small
// requests keep each one well inside Worker limits, and a failure stops only that record.
// Everything sent is validated again here; the browser's preview is only a preview.

const Keys = z.array(z.string().max(200)).min(1).max(50);

const importedKeys = async (db: Db) => ({
	equipment: (
		await db
			.select({ key: equipment.importKey })
			.from(equipment)
			.where(isNotNull(equipment.importKey))
	).map((r) => r.key!),
	logs: (
		await db
			.select({ key: maintenanceLog.importKey })
			.from(maintenanceLog)
			.where(isNotNull(maintenanceLog.importKey))
	).map((r) => r.key!)
});

export const load = async ({ locals }) => {
	requirePermission(locals, 'admin');
	return {
		locations: await loadLocations(locals),
		imported: await importedKeys(locals.db),
		handEntered: (
			await locals.db
				.select({ name: equipment.name })
				.from(equipment)
				.where(isNull(equipment.importKey))
		).map((e) => e.name.trim().toLowerCase())
	};
};

export const actions = {
	equipment: async ({ request, locals }) => {
		requirePermission(locals, 'admin');
		const form = await request.formData();
		const record = json(EquipmentImport, form.get('record'));
		if (!record) return fail(400, { error: 'That equipment record is not valid' });
		const [place] = await locals.db
			.select({ id: location.id })
			.from(location)
			.where(eq(location.id, String(form.get('locationId'))));
		if (!place) return fail(400, { error: 'Choose a location' });

		const [existing] = await locals.db
			.select({ id: equipment.id })
			.from(equipment)
			.where(eq(equipment.importKey, record.key));
		if (existing) return { id: existing.id, skipped: true };

		const { key, jobs, reading } = record;
		const id = newId();
		await locals.db.insert(equipment).values({
			id,
			name: record.name,
			category: record.category,
			kind: record.kind,
			status: record.status,
			manufacturer: record.manufacturer,
			model: record.model,
			serialNumber: record.serialNumber,
			year: record.year,
			place: record.place,
			operatorName: record.operatorName,
			meterUnit: record.meterUnit,
			notes: record.notes,
			locationId: place.id,
			importKey: key
		});
		try {
			// The records' service ids become the slugs, so logs can find their jobs.
			const rows = jobs.map((job, sortOrder) => ({
				id: newId(),
				equipmentId: id,
				...job,
				sortOrder
			}));
			for (const chunk of chunksFor(rows, 10)) await locals.db.insert(serviceJob).values(chunk);
			if (reading) {
				await locals.db.insert(meterReading).values({
					equipmentId: id,
					value: reading.value,
					readOn: reading.readOn,
					authorId: locals.user!.id
				});
			}
			await refreshDue(locals.db, id);
		} catch (e) {
			// Cascades to the jobs, so a retry starts clean.
			await locals.db.delete(equipment).where(eq(equipment.id, id));
			throw e;
		}
		return { id, skipped: false };
	},

	// One PDF, linked to every imported item that names it and has no manual yet.
	manual: async ({ request, locals }) => {
		requirePermission(locals, 'admin');
		const form = await request.formData();
		const file = form.get('manual');
		if (!(file instanceof File)) return fail(400, { error: 'Choose a PDF' });
		const problem = manualFileError(file);
		if (problem) return fail(400, { error: problem });
		const text = parseManualText(String(form.get('text')));
		const keys = json(Keys, form.get('keys'));
		if (!text.success || !keys) return fail(400, { error: 'Could not read that PDF' });

		const manualId = await saveManual(
			{ db: locals.db, bucket },
			file,
			text.data.pages,
			text.data.pageCount
		);
		if (!manualId) return fail(400, { error: 'That file is not a PDF' });
		await locals.db
			.update(equipment)
			.set({ manualId })
			.where(and(inArray(equipment.importKey, keys), isNull(equipment.manualId)));
		return { manualId };
	},

	log: async ({ request, locals }) => {
		requirePermission(locals, 'admin');
		const form = await request.formData();
		const record = json(LogImport, form.get('record'));
		if (!record) return fail(400, { error: 'That log record is not valid' });

		const [existing] = await locals.db
			.select({ id: maintenanceLog.id })
			.from(maintenanceLog)
			.where(eq(maintenanceLog.importKey, record.key));
		if (existing) return { id: existing.id, skipped: true };

		const item = await locals.db.query.equipment.findFirst({
			where: eq(equipment.importKey, record.equipmentKey),
			columns: { id: true, meterUnit: true },
			with: { serviceJobs: { columns: { id: true, slug: true } } }
		});
		if (!item) return fail(400, { error: `${record.equipmentKey} hasn't been imported` });
		const jobIds = item.serviceJobs
			.filter((j) => record.serviceSlugs.includes(j.slug))
			.map((j) => j.id);
		if (jobIds.length !== record.serviceSlugs.length)
			return fail(400, { error: `Some service_ids aren't services on ${record.equipmentKey}` });

		const files = photoFiles(form);
		const photoProblem = photoError(files);
		if (photoProblem) return fail(400, { error: photoProblem });
		const captions =
			json(z.array(z.string().max(300).nullable()).max(30), form.get('captions')) ?? [];

		const id = newId();
		const meter = item.meterUnit ? record.meterReading : null;
		await locals.db.insert(maintenanceLog).values({
			id,
			equipmentId: item.id,
			// Who imported it. doneBy() doesn't present them as having done the work.
			authorId: locals.user!.id,
			importKey: record.key,
			type: record.type,
			summary: record.summary,
			description: record.description,
			performedOn: record.performedOn,
			meterReading: meter,
			performedBy: record.performedBy,
			partsUsed: record.partsUsed
		});
		try {
			await setLogJobs(locals.db, id, item.id, jobIds);
			await syncLogReading(
				locals.db,
				{ id, equipmentId: item.id, meterReading: meter, performedOn: record.performedOn },
				locals.user!.id
			);
			await refreshDue(locals.db, item.id);
			await savePhotos(
				{ db: locals.db, bucket },
				files,
				{ equipmentId: item.id, logId: id },
				captions
			);
		} catch (e) {
			// Cascades to its jobs and reading, so the next import retries this log.
			await locals.db.delete(maintenanceLog).where(eq(maintenanceLog.id, id));
			throw e;
		}
		return { id, skipped: false };
	}
};
