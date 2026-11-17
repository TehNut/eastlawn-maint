import { fail } from '@sveltejs/kit';
import { eq, notInArray } from 'drizzle-orm';
import { requirePermission } from '$lib/server/access';
import { newId, productStandard } from '$lib/server/db/schema';
import { parseStandards } from '$lib/server/forms';
import { loadStandards } from '$lib/server/standards';

export const load = async ({ locals }) => {
	requirePermission(locals, 'admin');
	return { standards: await loadStandards(locals.db) };
};

export const actions = {
	// Saves the whole list in its new order; standards left out are deleted.
	save: async ({ request, locals }) => {
		requirePermission(locals, 'admin');
		const parsed = parseStandards(String((await request.formData()).get('standards')));
		if (!parsed.success) return fail(400, { error: parsed.error });
		const keep = parsed.data.flatMap((s) => (s.id ? [s.id] : []));
		await locals.db
			.delete(productStandard)
			.where(keep.length ? notInArray(productStandard.id, keep) : undefined);
		for (const [sortOrder, { id, ...fields }] of parsed.data.entries()) {
			const updated = id
				? await locals.db
						.update(productStandard)
						.set({ ...fields, sortOrder })
						.where(eq(productStandard.id, id))
						.returning({ id: productStandard.id })
				: [];
			if (!updated.length)
				await locals.db.insert(productStandard).values({ id: newId(), ...fields, sortOrder });
		}
	}
};
