import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { equipment } from '$lib/server/db/schema';
import { labelSvg, labelWithId } from '$lib/server/equipment';

export const load = async ({ locals, params, request, url }) => {
	const item = await locals.db.query.equipment.findFirst({
		where: eq(equipment.id, params.id),
		columns: { id: true, name: true, serialNumber: true },
		with: { location: { columns: { name: true } } }
	});
	if (!item) error(404, 'Equipment not found');

	const svg = await labelSvg(url, request.headers, item.id);
	return { item, svg, download: labelWithId(svg, item.id) };
};
