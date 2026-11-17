import { error } from '@sveltejs/kit';
import { manualKey } from '$lib/server/manuals';
import { bucket } from '$lib/server/storage';

// Honours Range so the reader fetches the pages being read, not the whole PDF.
export const GET = async ({ params, request }) => {
	if (!/^[\w-]+$/.test(params.id)) error(404, 'Not found');
	const object = await bucket.get(manualKey(params.id), request.headers.get('range'));
	if (!object) error(404, 'Not found');

	const headers = new Headers({
		'Content-Type': 'application/pdf',
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'private, max-age=31536000, immutable',
		'X-Content-Type-Options': 'nosniff'
	});
	if (object.range) {
		const { start, end } = object.range;
		headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
		headers.set('Content-Length', String(end - start + 1));
		return new Response(object.body, { status: 206, headers });
	}
	headers.set('Content-Length', String(object.size));
	return new Response(object.body, { headers });
};
