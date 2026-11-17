import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from '@tursodatabase/database/compat';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import * as schema from './schema';

// Photos, manuals and the database all live here, so one volume holds everything.
export const DATA_DIR = process.env.DATA_DIR ?? 'data';

type Query = { sql: string; params: unknown[]; method: 'run' | 'all' | 'values' | 'get' };

// Turso's sync API, so a batch runs start to finish without another request's statement landing
// inside its transaction on this shared connection.
function connect(path: string) {
	mkdirSync(DATA_DIR, { recursive: true });
	// index_method enables the full-text index on manual_chunk (drizzle/0003).
	const client = new Database(path, { experimental: ['index_method'] });
	// Off by default in SQLite (D1 had it on), and the schema relies on cascades and restricts.
	client.exec('PRAGMA foreign_keys = ON');
	const exec = ({ sql, params, method }: Query) => {
		const stmt = client.prepare(sql);
		if (method === 'run') return { rows: [], ...stmt.run(...params) };
		if (method === 'get') return { rows: stmt.raw(true).get(...params) };
		return { rows: stmt.raw(true).all(...params) };
	};
	const transaction = <T>(fn: () => T) => {
		client.exec('BEGIN');
		try {
			const result = fn();
			client.exec('COMMIT');
			return result;
		} catch (e) {
			client.exec('ROLLBACK');
			throw e;
		}
	};
	return { exec, transaction };
}

export async function openDb(path = join(DATA_DIR, 'app.db')) {
	const { exec, transaction } = connect(path);
	const db = drizzle(
		async (sql, params, method) => exec({ sql, params, method }),
		async (queries) => transaction(() => queries.map(exec)),
		{ schema }
	);
	await migrate(
		db,
		async (statements) =>
			transaction(() => statements.forEach((sql) => exec({ sql, params: [], method: 'run' }))),
		{ migrationsFolder: 'drizzle' }
	);
	return db;
}

export type Db = Awaited<ReturnType<typeof openDb>>;

// Keeps multi-row inserts well under SQLite's bound-parameter limit.
export function chunksFor<T>(rows: T[], paramsPerRow: number) {
	const size = Math.max(1, Math.floor(100 / paramsPerRow));
	const chunks: T[][] = [];
	for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
	return chunks;
}
