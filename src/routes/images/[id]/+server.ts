import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { photo } from '$lib/server/db/schema';
import { bucket } from '$lib/server/storage';

export const GET = async ({ params, locals }) => {
	const [row] = await locals.db
		.select({ contentType: photo.contentType })
		.from(photo)
		.where(eq(photo.id, params.id));
	const object = row && (await bucket.get(params.id));
	if (!object) error(404, 'Not found');
	return new Response(object.body, {
		headers: {
			'Content-Type': row.contentType,
			'Content-Length': String(object.size),
			'Cache-Control': 'private, max-age=31536000, immutable',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
