// Shared by the server and tests, so no $lib or platform imports here.

export type PageText = { page: number; text: string };
export type Chunk = { page: number; text: string };

const CHUNK_SIZE = 1200;
const OVERLAP = 150;
const MIN_CHUNK = 20;

// Small overlapping pieces, so a search returns a passage rather than a whole page.
export function chunkPages(pages: PageText[]): Chunk[] {
	const chunks: Chunk[] = [];
	for (const { page, text } of pages) {
		const clean = text.replace(/\s+/g, ' ').trim();
		let start = 0;
		while (start < clean.length) {
			let end = Math.min(start + CHUNK_SIZE, clean.length);
			if (end < clean.length) {
				// Prefer breaking at a sentence, then a word, in the back half of the chunk.
				const window = clean.slice(start + CHUNK_SIZE / 2, end);
				const sentence = window.lastIndexOf('. ');
				const space = window.lastIndexOf(' ');
				const cut = sentence >= 0 ? sentence + 1 : space;
				if (cut >= 0) end = start + CHUNK_SIZE / 2 + cut;
			}
			const piece = clean.slice(start, end).trim();
			if (piece.length >= MIN_CHUNK) chunks.push({ page, text: piece });
			if (end >= clean.length) break;
			start = end - OVERLAP;
		}
	}
	return chunks;
}

const STOP_WORDS = new Set(
	'a an and are as at be by can do does for from how i in is it my of on or should the this to what when where which why will with you'.split(
		' '
	)
);

// Model and user text must never reach MATCH as raw FTS syntax, so every term is quoted.
// Terms are ORed: BM25 ranks passages matching more of them first.
// The index has no stemmer, so each term also matches its plain plural or singular.
export function ftsQuery(manualId: string, query: string) {
	const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	const terms = [...new Set(words)].filter((w) => !STOP_WORDS.has(w)).slice(0, 12);
	if (!terms.length) return null;
	const forms = terms.flatMap((t) => [
		t,
		t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : `${t}s`
	]);
	return `manual_id:"${manualId}" AND text:(${[...new Set(forms)].map((t) => `"${t}"`).join(' OR ')})`;
}
