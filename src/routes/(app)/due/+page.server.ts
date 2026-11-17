import { env } from '$env/dynamic/private';
import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { CATEGORIES, categoryValues, type Category } from '$lib/constants';
import { inUserLocation } from '$lib/server/access';
import { equipment, location, serviceJob } from '$lib/server/db/schema';
import { paginate } from '$lib/server/pagination';
import { appToday, flagSql, itemDue, sortByUrgency } from '$lib/server/schedule';
import { FLAGS, type Flag } from '$lib/schedule';
import { loadLocations } from '$lib/server/locations';

const categoryRank = sql<number>`(CASE ${equipment.category} ${sql.join(
	CATEGORIES.map((c, i) => sql`WHEN ${c.value} THEN ${i}`),
	sql` `
)} END)`;

// The skill's "list equipment": every scheduled item that isn't retired, grouped by category,
// most urgent first, with its reading and the jobs that need attention. Flags come from the due
// summary stored on each item, so no history is read here.
export const load = async ({ locals, url }) => {
	const locationId = url.searchParams.get('location') ?? '';
	const raw = url.searchParams.get('category') ?? '';
	const category = categoryValues.includes(raw as Category) ? (raw as Category) : '';
	const rawFlag = url.searchParams.get('flag') ?? '';
	const flag = FLAGS.includes(rawFlag as Flag) ? (rawFlag as Flag) : '';
	const today = appToday(env);
	const flagRank = flagSql(today);
	const scheduled = and(
		inUserLocation(locals, equipment.locationId),
		ne(equipment.status, 'retired'),
		gt(equipment.jobCount, 0),
		locationId ? eq(equipment.locationId, locationId) : undefined,
		category ? eq(equipment.category, category) : undefined
	);

	const locations = await loadLocations(locals);

	// Streamed: the filters render while the counts and list load.
	const list = (async () => {
		const [page, countRows] = await Promise.all([
			paginate(url, {
				size: 24,
				columns: [categoryRank, flagRank, equipment.name, equipment.id],
				direction: 'asc',
				run: (p) =>
					locals.db
						.select({
							id: equipment.id,
							name: equipment.name,
							category: equipment.category,
							status: equipment.status,
							meterUnit: equipment.meterUnit,
							readingValue: equipment.readingValue,
							readingOn: equipment.readingOn,
							usageRate: equipment.usageRate,
							locationName: location.name,
							categoryRank,
							flagRank
						})
						.from(equipment)
						.innerJoin(location, eq(equipment.locationId, location.id))
						.where(
							and(
								scheduled,
								// Up to date items only show when asked for.
								flag
									? eq(flagRank, FLAGS.indexOf(flag))
									: ne(flagRank, FLAGS.indexOf('up_to_date')),
								p.where
							)
						)
						.orderBy(...p.orderBy)
						.limit(p.limit),
				key: (item) => [item.categoryRank, item.flagRank, item.name, item.id]
			}),
			// The counts ignore the flag filter, since tapping them is how it's chosen.
			locals.db
				.select({ flag: flagRank, total: sql<number>`count(*)` })
				.from(equipment)
				.where(scheduled)
				.groupBy(flagRank)
		]);

		// Only this page's items' jobs.
		const ids = page.items.map((i) => i.id);
		const jobs = ids.length
			? await locals.db
					.select()
					.from(serviceJob)
					.where(inArray(serviceJob.equipmentId, ids))
					.orderBy(asc(serviceJob.sortOrder), asc(serviceJob.createdAt))
			: [];
		const rows = page.items.map((item) => {
			const due = itemDue(
				item,
				jobs.filter((j) => j.equipmentId === item.id),
				today
			);
			const itemFlag = FLAGS[item.flagRank];
			const sorted = sortByUrgency(due.jobs);
			// Up-to-date items show all their jobs; the others only the ones needing attention.
			const shown =
				itemFlag === 'up_to_date' ? sorted : sorted.filter((j) => j.due.state !== 'not_due');
			return { ...item, reading: due.reading, worst: due.worst, flag: itemFlag, jobs: shown };
		});

		const counts = Object.fromEntries(
			FLAGS.map((f, i) => [f, countRows.find((c) => c.flag === i)?.total ?? 0])
		) as Record<Flag, number>;

		return {
			// The page is already in category order; a category can continue onto the next page.
			groups: CATEGORIES.map((c) => ({
				...c,
				items: rows.filter((r) => r.category === c.value)
			})).filter((g) => g.items.length),
			counts,
			scheduled: Object.values(counts).reduce((a, b) => a + b, 0),
			next: page.next,
			prev: page.prev
		};
	})();

	return { today, locations, locationId, category, flag, list };
};
