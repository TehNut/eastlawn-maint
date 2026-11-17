import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

// Keyset (cursor) pagination. A page starts after (or ends before) the sort key of a row, so the
// database seeks to it instead of reading and skipping earlier rows the way OFFSET does, and rows
// added meanwhile don't shift pages.
//
// The sort key is a list of columns sharing one direction whose last column is unique (an id).
// Cursors arrive in the URL as ?after= or ?before=, so they're validated and only ever bound as
// parameters.

export type CursorValue = string | number;
export type Page<T> = {
	items: T[];
	// Cursors for the neighbouring pages. prev is '' when the previous page is the first one.
	next: string | null;
	prev: string | null;
};

const encode = (key: CursorValue[]) => Buffer.from(JSON.stringify(key)).toString('base64url');

function decode(raw: string | null, length: number): CursorValue[] | null {
	if (!raw) return null;
	try {
		const key: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString());
		return Array.isArray(key) &&
			key.length === length &&
			key.every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))
			? key
			: null;
	} catch {
		return null;
	}
}

export async function paginate<T>(
	url: URL,
	opts: {
		size: number;
		columns: SQLWrapper[];
		direction: 'asc' | 'desc';
		// The row's values for `columns`, in the same order and form as the database compares them.
		key: (row: T) => CursorValue[];
		run: (page: { where: SQL | undefined; orderBy: SQL[]; limit: number }) => PromiseLike<T[]>;
	}
): Promise<Page<T>> {
	const n = opts.columns.length;
	const after = decode(url.searchParams.get('after'), n);
	const before = after ? null : decode(url.searchParams.get('before'), n);

	const fetch = async (cursor: CursorValue[] | null, backwards: boolean) => {
		// Walking back flips the order; the rows are put back the right way round after.
		const asc = (opts.direction === 'asc') !== backwards;
		const columns = sql.join(opts.columns, sql`, `);
		const values = sql.join(
			(cursor ?? []).map((v) => sql`${v}`),
			sql`, `
		);
		const rows = await opts.run({
			where: cursor
				? asc
					? sql`(${columns}) > (${values})`
					: sql`(${columns}) < (${values})`
				: undefined,
			orderBy: opts.columns.map((c) => (asc ? sql`${c} asc` : sql`${c} desc`)),
			limit: opts.size + 1
		});
		const more = rows.length > opts.size;
		const items = rows.slice(0, opts.size);
		if (backwards) items.reverse();
		return { items, more };
	};

	if (before) {
		const { items, more } = await fetch(before, true);
		// Reached the start: show a full first page rather than the few rows left before it.
		if (!more) return paginate(stripCursor(url), opts);
		return {
			items,
			next: encode(opts.key(items.at(-1)!)),
			prev: encode(opts.key(items[0]))
		};
	}
	const { items, more } = await fetch(after, false);
	const last = items.at(-1);
	return {
		items,
		next: more && last ? encode(opts.key(last)) : null,
		// After a cursor there's always something before; with no rows here, go back to the start.
		prev: after ? (items.length ? encode(opts.key(items[0])) : '') : null
	};
}

function stripCursor(url: URL) {
	const copy = new URL(url);
	copy.searchParams.delete('after');
	copy.searchParams.delete('before');
	return copy;
}
