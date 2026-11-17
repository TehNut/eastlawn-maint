import { env } from '$env/dynamic/private';
import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import {
	equipment,
	maintenanceLog,
	manualBookmark,
	meterReading,
	photo,
	serviceJob
} from '$lib/server/db/schema';
import { labelSvg, labelWithId } from '$lib/server/equipment';
import { parseReading } from '$lib/server/forms';
import { appToday, itemDue, readingProblem, refreshDue } from '$lib/server/schedule';

export const load = ({ locals, params, request, url }) => ({
	// Streamed, a 404 included: the page shows at once, its skeleton until this settles.
	page: (async () => {
		const item = await locals.db.query.equipment.findFirst({
			where: eq(equipment.id, params.id),
			with: {
				location: true,
				manual: { columns: { id: true, name: true, pageCount: true } },
				attachedTo: { columns: { id: true, name: true } },
				attachments: { columns: { id: true, name: true } },
				photos: { where: isNull(photo.logId), orderBy: [photo.createdAt] },
				serviceJobs: { orderBy: [asc(serviceJob.sortOrder), asc(serviceJob.createdAt)] },
				logs: {
					orderBy: [desc(maintenanceLog.performedOn), desc(maintenanceLog.createdAt)],
					// One more than shown, to know whether to link to the full history.
					limit: 6,
					with: { author: { columns: { name: true } }, photos: true }
				}
			}
		});
		if (!item) error(404, 'Equipment not found');
		const today = appToday(env);
		const due = itemDue(item, item.serviceJobs, today);
		// Only pages of the current manual; a replaced manual's pages no longer point anywhere useful.
		const bookmarks = item.manual
			? await locals.db
					.select({
						id: manualBookmark.id,
						page: manualBookmark.page,
						label: manualBookmark.label,
						serviceJobId: manualBookmark.serviceJobId
					})
					.from(manualBookmark)
					.where(
						and(
							eq(manualBookmark.equipmentId, item.id),
							eq(manualBookmark.manualId, item.manual.id)
						)
					)
					.orderBy(asc(manualBookmark.page))
			: [];
		const label = await labelSvg(url, request.headers, item.id);
		return {
			item,
			jobs: due.jobs,
			reading: due.reading,
			worst: due.worst,
			today,
			// Shown beside the details on wide screens.
			label,
			labelDownload: labelWithId(label, item.id),
			bookmarks
		};
	})()
});

export const actions = {
	deleteBookmark: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const id = String((await request.formData()).get('bookmarkId'));
		await locals.db
			.delete(manualBookmark)
			.where(and(eq(manualBookmark.id, id), eq(manualBookmark.equipmentId, params.id)));
	},

	// A reading taken without any work, e.g. on a walk-round.
	recordReading: async ({ request, locals, params }) => {
		requirePermission(locals, 'log.create');
		const form = await request.formData();
		const parsed = parseReading(form);
		if (!parsed.success) return fail(400, { readingError: parsed.error });
		const [item] = await locals.db
			.select({ id: equipment.id, meterUnit: equipment.meterUnit })
			.from(equipment)
			.where(eq(equipment.id, params.id));
		if (!item) error(404, 'Equipment not found');
		if (!item.meterUnit) return fail(400, { readingError: 'This item has no meter' });
		const problem = await readingProblem(locals.db, item, {
			value: parsed.data.value,
			date: parsed.data.readOn,
			required: true,
			confirmed: form.has('confirmLower')
		});
		if (problem)
			return fail(400, { readingError: problem.error, confirmLower: problem.confirmLower });
		await locals.db.insert(meterReading).values({
			equipmentId: params.id,
			value: parsed.data.value!,
			readOn: parsed.data.readOn,
			authorId: locals.user!.id
		});
		await refreshDue(locals.db, params.id);
	}
};
