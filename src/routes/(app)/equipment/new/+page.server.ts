import { fail, redirect } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/access';
import { equipment, newId } from '$lib/server/db/schema';
import { attachTargets, checkAttachment } from '$lib/server/equipment';
import { parseEquipment, parseLogPresets, parseServiceJobs } from '$lib/server/forms';
import { photoError, photoFiles, savePhotos } from '$lib/server/photos';
import { refreshDue, saveServiceJobs } from '$lib/server/schedule';
import { loadStandards } from '$lib/server/standards';
import { loadLocations } from '$lib/server/locations';
import { bucket } from '$lib/server/storage';

export const load = async ({ locals, url }) => {
	requirePermission(locals, 'equipment.create');
	return {
		locations: await loadLocations(locals),
		locationId: locals.user!.locationId ?? url.searchParams.get('location') ?? undefined,
		parents: await attachTargets(locals),
		standards: await loadStandards(locals.db)
	};
};

export const actions = {
	save: async ({ request, locals }) => {
		requirePermission(locals, 'equipment.create');
		const form = await request.formData();
		const parsed = parseEquipment(form);
		if (!parsed.success) return fail(400, { error: parsed.error });
		const files = photoFiles(form);
		const photoProblem = photoError(files);
		if (photoProblem) return fail(400, { error: photoProblem });
		// The schedule and presets tabs submit with this form; each is sent only when filled in.
		const jobsField = form.get('jobs');
		const jobs = jobsField ? parseServiceJobs(String(jobsField)) : null;
		if (jobs && !jobs.success) return fail(400, { serviceError: jobs.error });
		if (!parsed.data.meterUnit && jobs?.data.some((j) => j.meterEvery))
			return fail(400, { serviceError: 'This item has no meter, so use calendar intervals.' });
		const presetsField = form.get('presets');
		const presets = presetsField ? parseLogPresets(String(presetsField)) : null;
		if (presets && !presets.success) return fail(400, { presetsError: presets.error });

		const id = newId();
		let locationId = locals.user!.locationId ?? parsed.data.locationId;
		if (parsed.data.attachedToId) {
			const attached = await checkAttachment(locals, null, parsed.data.attachedToId);
			if ('error' in attached) return fail(400, { error: attached.error });
			locationId = attached.locationId;
		}
		await locals.db
			.insert(equipment)
			.values({ id, ...parsed.data, locationId, logPresets: presets?.data });
		if (jobs?.data.length) {
			await saveServiceJobs(locals.db, id, jobs.data);
			await refreshDue(locals.db, id);
		}
		await savePhotos({ db: locals.db, bucket }, files, {
			equipmentId: id
		});
		redirect(303, `/equipment/${id}`);
	}
};
