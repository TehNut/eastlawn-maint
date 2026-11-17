import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { maintenanceLog, photo } from '$lib/server/db/schema';
import { deletePhotoObjects } from '$lib/server/photos';
import { refreshDue } from '$lib/server/schedule';
import { bucket } from '$lib/server/storage';

const scope = (params: { id: string; logId: string }) =>
	and(eq(maintenanceLog.id, params.logId), eq(maintenanceLog.equipmentId, params.id));

export const load = ({ locals, params }) => ({
	page: (async () => {
		const log = await locals.db.query.maintenanceLog.findFirst({
			where: scope(params),
			with: {
				author: { columns: { name: true } },
				photos: true,
				equipment: { columns: { id: true, name: true, meterUnit: true } },
				serviceJobs: { with: { serviceJob: { columns: { id: true, name: true } } } }
			}
		});
		if (!log) error(404, 'Log not found');
		return { log };
	})()
});

export const actions = {
	delete: async ({ locals, params }) => {
		requirePermission(locals, 'log.delete');
		const photos = await locals.db
			.select({ id: photo.id })
			.from(photo)
			.where(and(eq(photo.logId, params.logId), eq(photo.equipmentId, params.id)));
		// Cascades to its job links and reading, which the summary is rebuilt without.
		await locals.db.delete(maintenanceLog).where(scope(params));
		await refreshDue(locals.db, params.id);
		await deletePhotoObjects(
			bucket,
			photos.map((p) => p.id)
		);
		redirect(303, `/equipment/${params.id}`);
	}
};
