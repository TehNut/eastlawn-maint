import { asc } from 'drizzle-orm';
import type { Db } from './db';
import { productStandard } from './db/schema';

export const loadStandards = (db: Db) =>
	db.select().from(productStandard).orderBy(asc(productStandard.sortOrder));
