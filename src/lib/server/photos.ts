import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from './db';
import { newId, photo } from './db/schema';
import type { Bucket } from './storage';

const MAX_BYTES = 15 * 1024 * 1024;
// SVG is deliberately excluded: it can carry scripts.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif'];

export const photoFiles = (form: FormData) =>
	form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);

// Call before writing anything, so a bad file can't leave a half-saved record.
export function photoError(files: File[]) {
	if (files.some((f) => !ALLOWED.includes(f.type))) return 'Unsupported image type';
	if (files.some((f) => f.size > MAX_BYTES)) return 'Image is too large';
	return null;
}

// captions, when given, line up with files.
export async function savePhotos(
	{ db, bucket }: { db: Db; bucket: Bucket },
	files: File[],
	owner: { equipmentId: string; logId?: string },
	captions: (string | null)[] = []
) {
	await Promise.all(
		files.map(async (file, i) => {
			const id = newId();
			await bucket.put(id, file);
			await db
				.insert(photo)
				.values({ id, contentType: file.type, caption: captions[i] ?? null, ...owner });
		})
	);
}

export async function deletePhotoObjects(bucket: Bucket, ids: string[]) {
	if (ids.length) await bucket.delete(ids);
}

export async function deletePhotos(db: Db, bucket: Bucket, ids: string[]) {
	if (!ids.length) return;
	await db.delete(photo).where(inArray(photo.id, ids));
	await deletePhotoObjects(bucket, ids);
}

// Sets one photo's caption. The owner check keeps a form from captioning another item's photo;
// logId null means an equipment photo.
export async function savePhotoCaption(
	db: Db,
	form: FormData,
	owner: { equipmentId: string; logId?: string }
) {
	const id = String(form.get('photoId'));
	const caption =
		String(form.get('caption') ?? '')
			.trim()
			.slice(0, 300) || null;
	await db
		.update(photo)
		.set({ caption })
		.where(
			and(
				eq(photo.id, id),
				eq(photo.equipmentId, owner.equipmentId),
				owner.logId ? eq(photo.logId, owner.logId) : isNull(photo.logId)
			)
		);
}
