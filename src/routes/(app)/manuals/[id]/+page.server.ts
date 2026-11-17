import { error, fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { can } from '$lib/permissions';
import { inUserLocation, requirePermission } from '$lib/server/access';
import { equipment, manual, manualBookmark, serviceJob } from '$lib/server/db/schema';
import { searchManual } from '$lib/server/manuals';

const ID = /^[0-9a-f]{16}$/;

// The item the manual was opened from, if the user can see it and it uses this manual. Saved
// pages belong to that item.
async function fromItem(locals: App.Locals, manualId: string, from: string) {
	if (!ID.test(from)) return null;
	const [item] = await locals.db
		.select({ id: equipment.id, name: equipment.name })
		.from(equipment)
		.where(
			and(
				eq(equipment.id, from),
				eq(equipment.manualId, manualId),
				inUserLocation(locals, equipment.locationId)
			)
		);
	return item ?? null;
}

export const load = async ({ locals, params, url }) => {
	const [item] = await locals.db
		.select({
			id: manual.id,
			name: manual.name,
			pageCount: manual.pageCount,
			chunkCount: manual.chunkCount
		})
		.from(manual)
		.where(eq(manual.id, params.id));
	if (!item) error(404, 'Manual not found');

	const q = url.searchParams.get('q')?.trim() ?? '';
	const from = url.searchParams.get('from') ?? '';
	const owner = await fromItem(locals, item.id, from);
	return {
		item,
		q,
		page: Number(url.searchParams.get('page')) || 1,
		back: ID.test(from) ? `/equipment/${from}` : '/',
		results: q ? await searchManual(locals.db, item.id, q) : [],
		// Saving a page needs an item to keep it on.
		owner: owner && can(locals.user, 'equipment.update') ? owner : null,
		jobs: owner
			? await locals.db
					.select({ id: serviceJob.id, name: serviceJob.name })
					.from(serviceJob)
					.where(eq(serviceJob.equipmentId, owner.id))
					.orderBy(asc(serviceJob.sortOrder), asc(serviceJob.createdAt))
			: []
	};
};

const Bookmark = z.object({
	from: z.string(),
	page: z.coerce.number().int().min(1),
	label: z.string().trim().min(1, 'Name the page').max(200),
	serviceJobId: z
		.string()
		.optional()
		.transform((v) => v || null)
});

export const actions = {
	bookmark: async ({ request, locals, params }) => {
		requirePermission(locals, 'equipment.update');
		const parsed = Bookmark.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: parsed.error.issues[0].message });
		const { from, page, label, serviceJobId } = parsed.data;

		const owner = await fromItem(locals, params.id, from);
		if (!owner) return fail(400, { error: 'Open the manual from an item to save a page' });
		const [found] = await locals.db
			.select({ pageCount: manual.pageCount })
			.from(manual)
			.where(eq(manual.id, params.id));
		if (!found || page > found.pageCount)
			return fail(400, { error: 'That page is not in this manual' });
		if (serviceJobId) {
			const [job] = await locals.db
				.select({ id: serviceJob.id })
				.from(serviceJob)
				.where(and(eq(serviceJob.id, serviceJobId), eq(serviceJob.equipmentId, owner.id)));
			if (!job) return fail(400, { error: "Choose one of this item's service jobs" });
		}
		await locals.db.insert(manualBookmark).values({
			manualId: params.id,
			equipmentId: owner.id,
			serviceJobId,
			page,
			label,
			authorId: locals.user!.id
		});
		return { saved: true };
	}
};
