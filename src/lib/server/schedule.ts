import { and, eq, inArray, lte, ne, notInArray, or, isNull, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Part } from '$lib/constants';
import {
	byUrgency,
	DUE_SOON_DAYS,
	FLAGS,
	addDays,
	dueDates,
	dueFrom,
	itemDates,
	summarize,
	todayIn,
	worstState,
	type Completion,
	type Due,
	type Reading
} from '$lib/schedule';
import { chunksFor, type Db } from './db';
import {
	equipment,
	logServiceJob,
	maintenanceLog,
	meterReading,
	newId,
	serviceJob
} from './db/schema';

export const appToday = (env: Env) => todayIn(env.APP_TIMEZONE);

export type JobDue = typeof serviceJob.$inferSelect & { due: Due };
export type ItemDue = {
	jobs: JobDue[];
	reading: Reading | null;
	worst: 'due' | 'due_soon' | null;
};
type StoredItem = Pick<
	typeof equipment.$inferSelect,
	'status' | 'readingValue' | 'readingOn' | 'usageRate'
>;

// Rewrites one item's due summary from its own history. Call after anything that changes its
// logs, the jobs they completed, its readings or its service jobs; lists then only read the
// summary. One item's history per write, never the fleet's.
export async function refreshDue(db: Db, equipmentId: string) {
	const [jobs, completions, readings] = await Promise.all([
		db.select().from(serviceJob).where(eq(serviceJob.equipmentId, equipmentId)),
		db
			.select({
				serviceJobId: logServiceJob.serviceJobId,
				performedOn: maintenanceLog.performedOn,
				meterReading: maintenanceLog.meterReading
			})
			.from(logServiceJob)
			.innerJoin(maintenanceLog, eq(logServiceJob.logId, maintenanceLog.id))
			.where(eq(maintenanceLog.equipmentId, equipmentId)),
		db
			.select({ value: meterReading.value, readOn: meterReading.readOn })
			.from(meterReading)
			.where(eq(meterReading.equipmentId, equipmentId))
	]);
	const doneBy = new Map<string, Completion[]>();
	for (const { serviceJobId, ...c } of completions) {
		doneBy.set(serviceJobId, [...(doneBy.get(serviceJobId) ?? []), c]);
	}
	const perJob = jobs.map((job) => {
		const inputs = summarize(doneBy.get(job.id) ?? [], readings);
		return { job, last: inputs.last, dates: dueDates(job, inputs) };
	});
	const { reading, rate } = summarize([], readings);
	// One batch, so the item and its jobs never disagree.
	await db.batch([
		db
			.update(equipment)
			.set({
				readingValue: reading?.value ?? null,
				readingOn: reading?.readOn ?? null,
				usageRate: rate,
				...itemDates(perJob.map((j) => j.dates))
			})
			.where(eq(equipment.id, equipmentId)),
		...perJob.map(({ job, last }) =>
			db
				.update(serviceJob)
				.set({ lastDoneOn: last?.performedOn ?? null, lastDoneMeter: last?.meterReading ?? null })
				.where(eq(serviceJob.id, job.id))
		)
	]);
}

// Job states from the stored summary, for the pages that show them. Needs no history.
export function itemDue(
	item: StoredItem,
	jobs: (typeof serviceJob.$inferSelect)[],
	today: string
): ItemDue {
	const reading =
		item.readingValue != null && item.readingOn
			? { value: item.readingValue, readOn: item.readingOn }
			: null;
	const withDue = jobs.map((job) => ({
		...job,
		due: dueFrom(
			job,
			{
				last: job.lastDoneOn
					? { performedOn: job.lastDoneOn, meterReading: job.lastDoneMeter }
					: null,
				reading,
				rate: item.usageRate
			},
			today
		)
	}));
	return {
		jobs: withDue,
		reading,
		// Retired items keep their schedule on record but never show as due.
		worst: item.status === 'retired' ? null : worstState(withDue.map((j) => j.due.state))
	};
}

// itemFlag in SQL, as its index in FLAGS, so lists can filter, sort and count by it.
export const flagSql = (today: string) => sql<number>`(CASE
	WHEN ${equipment.dueOn} <= ${today} THEN ${FLAGS.indexOf('due')}
	WHEN ${equipment.soonOn} <= ${addDays(today, DUE_SOON_DAYS)} THEN ${FLAGS.indexOf('due_soon')}
	WHEN ${equipment.unloggedJobs} > 0 THEN ${FLAGS.indexOf('no_history')}
	ELSE ${FLAGS.indexOf('up_to_date')} END)`;

export const sortByUrgency = (jobs: JobDue[]) =>
	[...jobs].sort((a, b) => byUrgency(a.due.state, b.due.state));

// The highest reading dated on or before `date`, other than this log's own. Used to catch typos:
// a reading lower than an earlier one needs the user to confirm the meter was replaced.
export async function higherEarlierReading(
	db: Db,
	equipmentId: string,
	value: number,
	date: string,
	excludeLogId?: string
) {
	const rows = await db
		.select({ value: meterReading.value, readOn: meterReading.readOn })
		.from(meterReading)
		.where(
			and(
				eq(meterReading.equipmentId, equipmentId),
				lte(meterReading.readOn, date),
				excludeLogId
					? or(isNull(meterReading.logId), ne(meterReading.logId, excludeLogId))
					: undefined
			)
		);
	const max = rows.reduce<{ value: number; readOn: string } | null>(
		(best, r) => (!best || r.value > best.value ? r : best),
		null
	);
	return max && max.value > value ? max : null;
}

// Validates a reading from a form. Returns the failure to send back, or null if it's fine.
export async function readingProblem(
	db: Db,
	item: { id: string; meterUnit: string | null },
	reading: { value: number | null; date: string; required: boolean; confirmed: boolean },
	excludeLogId?: string
): Promise<{ error: string; confirmLower?: boolean } | null> {
	if (!item.meterUnit) return null;
	if (reading.value == null) {
		return reading.required ? { error: `Enter the meter reading (${item.meterUnit})` } : null;
	}
	if (reading.confirmed) return null;
	const higher = await higherEarlierReading(db, item.id, reading.value, reading.date, excludeLogId);
	return higher
		? {
				error: `That's lower than ${higher.value} recorded on ${higher.readOn}. Check the reading, or confirm the meter was replaced.`,
				confirmLower: true
			}
		: null;
}

// Keeps a log's reading row in step with the log: written, moved or removed.
export async function syncLogReading(
	db: Db,
	log: { id: string; equipmentId: string; meterReading: number | null; performedOn: string },
	authorId: string
) {
	if (log.meterReading == null) {
		await db.delete(meterReading).where(eq(meterReading.logId, log.id));
		return;
	}
	await db
		.insert(meterReading)
		.values({
			equipmentId: log.equipmentId,
			logId: log.id,
			value: log.meterReading,
			readOn: log.performedOn,
			authorId
		})
		.onConflictDoUpdate({
			target: meterReading.logId,
			set: { value: log.meterReading, readOn: log.performedOn }
		});
}

// Replaces the jobs a log completed. Ids that aren't this item's jobs are dropped, since they
// come from the form.
export async function setLogJobs(db: Db, logId: string, equipmentId: string, ids: string[]) {
	const valid = ids.length
		? (
				await db
					.select({ id: serviceJob.id })
					.from(serviceJob)
					.where(and(eq(serviceJob.equipmentId, equipmentId), inArray(serviceJob.id, ids)))
			).map((j) => j.id)
		: [];
	const rows = valid.map((serviceJobId) => ({ logId, serviceJobId }));
	// One batch, which runs all or nothing, so a failure can't leave the log unlinked.
	await db.batch([
		db.delete(logServiceJob).where(eq(logServiceJob.logId, logId)),
		...chunksFor(rows, 2).map((chunk) => db.insert(logServiceJob).values(chunk))
	]);
}

const kebab = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60) || 'job';

type JobInput = {
	id?: string;
	name: string;
	meterEvery: number | null;
	calendarEvery: number | null;
	calendarUnit: 'days' | 'months' | null;
	consumables: Part[];
	notes: string | null;
};

// Saves the whole list in its new order. Existing jobs keep their id and slug, so their history
// stays linked; jobs left out are deleted, which unlinks them from past logs.
export async function saveServiceJobs(db: Db, equipmentId: string, jobs: JobInput[]) {
	const existing = await db
		.select({ id: serviceJob.id, slug: serviceJob.slug })
		.from(serviceJob)
		.where(eq(serviceJob.equipmentId, equipmentId));
	const known = new Set(existing.map((j) => j.id));
	const keep = jobs.filter((j) => j.id && known.has(j.id)).map((j) => j.id!);
	const slugs = new Set(existing.filter((j) => keep.includes(j.id)).map((j) => j.slug));

	const uniqueSlug = (name: string) => {
		const base = kebab(name);
		let slug = base;
		for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
		slugs.add(slug);
		return slug;
	};

	// One batch, all or nothing and in one round trip.
	const writes: BatchItem<'sqlite'>[] = jobs.map(({ id, ...job }, sortOrder) =>
		id && known.has(id)
			? db
					.update(serviceJob)
					.set({ ...job, sortOrder })
					.where(and(eq(serviceJob.id, id), eq(serviceJob.equipmentId, equipmentId)))
			: db
					.insert(serviceJob)
					.values({ id: newId(), equipmentId, slug: uniqueSlug(job.name), ...job, sortOrder })
	);
	await db.batch([
		db
			.delete(serviceJob)
			.where(
				and(
					eq(serviceJob.equipmentId, equipmentId),
					keep.length ? notInArray(serviceJob.id, keep) : undefined
				)
			),
		...writes
	]);
}
