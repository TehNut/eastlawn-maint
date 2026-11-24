import { count, eq, sql } from 'drizzle-orm';
import { chunkPages, type PageText } from '$lib/manual-text';
import type { Db } from './db';
import { equipment, manual, newId } from './db/schema';
import { deletePassages, indexPassages, searchPassages } from './search';
import type { Bucket } from './storage';

const MAX_BYTES = 50 * 1024 * 1024;
// Keeps each bound JSON value to a modest size.
const MAX_BATCH_BYTES = 1_500_000;

export const manualKey = (id: string) => `manuals/${id}`;

export function manualFileError(file: File) {
	if (file.size > MAX_BYTES) return 'Manuals can be up to 50 MB';
	if (file.size === 0) return 'Choose a PDF';
	return null;
}

const toHex = (buffer: ArrayBuffer) =>
	[...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Stores the PDF and its search index, or returns the existing manual if this exact file is
// already here. Returns null if the file isn't a PDF.
export async function saveManual(
	{ db, bucket }: { db: Db; bucket: Bucket },
	file: File,
	pages: PageText[],
	pageCount: number
) {
	const bytes = await file.arrayBuffer();
	if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return null;

	const sha256 = toHex(await crypto.subtle.digest('SHA-256', bytes));
	const [existing] = await db
		.select({ id: manual.id })
		.from(manual)
		.where(eq(manual.sha256, sha256));
	if (existing) return existing.id;

	const id = newId();
	const chunks = chunkPages(pages);
	await bucket.put(manualKey(id), bytes);
	try {
		await db.insert(manual).values({
			id,
			sha256,
			name: file.name.replace(/\.pdf$/i, '').slice(0, 200),
			size: file.size,
			pageCount,
			chunkCount: chunks.length
		});
		await insertChunks(db, id, chunks);
		await indexPassages(id, chunks);
	} catch (e) {
		await bucket.delete(manualKey(id));
		await db.delete(manual).where(eq(manual.id, id));
		throw e;
	}
	return id;
}

// One statement per batch rather than one per chunk, using a JSON array as a single parameter.
async function insertChunks(db: Db, id: string, chunks: ReturnType<typeof chunkPages>) {
	let batch: typeof chunks = [];
	let bytes = 0;
	const flush = async () => {
		if (!batch.length) return;
		await db.run(sql`
			INSERT INTO manual_chunk (manual_id, page, text)
			SELECT ${id}, json_extract(value, '$.page'), json_extract(value, '$.text')
			FROM json_each(${JSON.stringify(batch)})
		`);
		batch = [];
		bytes = 0;
	};
	for (const chunk of chunks) {
		const size = new TextEncoder().encode(chunk.text).length * 2 + 32;
		if (bytes + size > MAX_BATCH_BYTES) await flush();
		batch.push(chunk);
		bytes += size;
	}
	await flush();
}

export const searchManual = searchPassages;

// Deletes a manual once nothing uses it. Call after unlinking or deleting equipment.
export async function pruneManual(db: Db, bucket: Bucket, id: string | null) {
	if (!id) return;
	const [{ total }] = await db
		.select({ total: count() })
		.from(equipment)
		.where(eq(equipment.manualId, id));
	if (total > 0) return;
	await db.delete(manual).where(eq(manual.id, id));
	await bucket.delete(manualKey(id));
	await deletePassages(id);
}
