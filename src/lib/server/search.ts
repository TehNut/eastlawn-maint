// Meilisearch over plain fetch. Holds manual passages; manual_chunk stays the source of truth, so
// the index can be rebuilt from the database at any time.
import { count } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { Db } from './db';
import { manualChunk } from './db/schema';

const MEILI_URL = env.MEILI_URL || 'http://localhost:7700';
const KEY = env.MEILI_MASTER_KEY ?? '';
const INDEX = 'manual_chunks';
const SEARCH_LIMIT = 5;

export type Passage = { page: number; text: string };

async function meili<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${MEILI_URL}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...(KEY && { Authorization: `Bearer ${KEY}` }) },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`Meilisearch ${method} ${path}: ${res.status} ${await res.text()}`);
	return res.json();
}

// Writes are queued tasks; waiting means a failed index shows up as an error, not a silent gap.
async function waitFor({ taskUid }: { taskUid: number }) {
	for (let delay = 50; ; delay = Math.min(delay * 2, 1000)) {
		const task = await meili<{ status: string; error?: { message: string } }>(
			'GET',
			`/tasks/${taskUid}`
		);
		if (task.status === 'succeeded') return;
		if (task.status === 'failed' || task.status === 'canceled')
			throw new Error(`Meilisearch task ${taskUid} ${task.status}: ${task.error?.message ?? ''}`);
		await new Promise((r) => setTimeout(r, delay));
	}
}

const byManual = (manualId: string) => `manualId = ${JSON.stringify(manualId)}`;

export async function indexPassages(manualId: string, passages: Passage[]) {
	if (!passages.length) return;
	const docs = passages.map((p, i) => ({ id: `${manualId}_${i}`, manualId, ...p }));
	await waitFor(await meili('POST', `/indexes/${INDEX}/documents?primaryKey=id`, docs));
}

export async function deletePassages(manualId: string) {
	await waitFor(
		await meili('POST', `/indexes/${INDEX}/documents/delete`, { filter: byManual(manualId) })
	);
}

export async function searchPassages(manualId: string, query: string): Promise<Passage[]> {
	if (!query.trim()) return [];
	const { hits } = await meili<{ hits: Passage[] }>('POST', `/indexes/${INDEX}/search`, {
		// Stop words match case-sensitively, so "How do I" would otherwise keep "I" as a required term.
		q: query.toLowerCase(),
		filter: byManual(manualId),
		limit: SEARCH_LIMIT,
		attributesToRetrieve: ['page', 'text'],
		// Natural-language questions: drop the commonest words first rather than the last ones.
		matchingStrategy: 'frequency'
	});
	return hits;
}

const STOP_WORDS =
	'a an and are as at be by can do does for from how i in is it my of on or should the this to what when where which why will with you'.split(
		' '
	);

// Run once at startup: applies settings, and refills an empty index (first run, or a lost volume).
export async function syncSearchIndex(db: Db) {
	await waitFor(
		await meili('PATCH', `/indexes/${INDEX}/settings`, {
			searchableAttributes: ['text'],
			filterableAttributes: ['manualId'],
			stopWords: STOP_WORDS
		})
	);
	const { numberOfDocuments } = await meili<{ numberOfDocuments: number }>(
		'GET',
		`/indexes/${INDEX}/stats`
	);
	const [{ total }] = await db.select({ total: count() }).from(manualChunk);
	if (numberOfDocuments > 0 || total === 0) return;

	const rows = await db
		.select({ manualId: manualChunk.manualId, page: manualChunk.page, text: manualChunk.text })
		.from(manualChunk)
		.orderBy(manualChunk.manualId, manualChunk.id);
	const grouped = Map.groupBy(rows, (r) => r.manualId);
	for (const [manualId, passages] of grouped)
		await indexPassages(
			manualId,
			passages.map(({ page, text }) => ({ page, text }))
		);
	console.log(`Search index rebuilt: ${grouped.size} manuals, ${rows.length} passages.`);
}
