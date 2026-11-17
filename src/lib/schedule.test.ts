// Run with `bun run test`. The two fleet examples come from the cemetery-maintenance skill's
// examples.md, so the app and the local agent agree on what is due.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	addDays,
	addMonths,
	computeDue,
	dueDates,
	dueFrom,
	itemDates,
	itemFlag,
	summarize,
	currentReading,
	describeInterval,
	dueLabel,
	lastCompletion,
	todayIn,
	usageRate,
	worstState
} from './schedule.ts';

describe('skill example: Cat 420 backhoe', () => {
	const engineOil = { meterEvery: 250, calendarEvery: 12, calendarUnit: 'months' as const };
	const fuelFilters = { meterEvery: 500, calendarEvery: null, calendarUnit: null };
	const completions = [{ performedOn: '2026-03-12', meterReading: 2200 }];
	// The oil change log wrote the first reading; the second was taken on its own.
	const readings = [
		{ value: 2200, readOn: '2026-03-12' },
		{ value: 2410, readOn: '2026-08-01' }
	];

	test('engine oil: meter due at 2450 with 40 hours left, calendar 2027-03-12', () => {
		const due = computeDue(engineOil, completions, readings, '2026-09-25');
		assert.equal(due.meter?.dueAt, 2450);
		assert.equal(due.meter?.remaining, 40);
		assert.equal(due.calendar?.dueOn, '2027-03-12');
		assert.equal(due.first, 'meter');
		// Not due by either threshold, but at ~1.5 h/day the 40 hours ran out before today.
		assert.equal(due.state, 'due_soon');
	});

	test('engine oil with a single reading is not due', () => {
		const due = computeDue(engineOil, completions, [readings[1]], '2026-09-25');
		assert.equal(due.state, 'not_due');
		assert.equal(due.meter?.projectedOn, null);
		// No usage rate, so the thresholds can't be ordered.
		assert.equal(due.first, null);
	});

	test('fuel filters have no history', () => {
		const due = computeDue(fuelFilters, [], readings, '2026-09-25');
		assert.equal(due.state, 'no_history');
		assert.equal(due.meter, null);
	});

	test('meter due once the reading reaches the threshold', () => {
		const due = computeDue(
			engineOil,
			completions,
			[...readings, { value: 2450, readOn: '2026-09-20' }],
			'2026-09-25'
		);
		assert.equal(due.state, 'due');
		assert.equal(due.meter?.remaining, 0);
		assert.equal(due.first, 'meter');
	});
});

describe('skill example: shop well (no meter)', () => {
	const sediment = { meterEvery: null, calendarEvery: 3, calendarUnit: 'months' as const };
	const pressure = { meterEvery: null, calendarEvery: 6, calendarUnit: 'months' as const };

	test('sediment filter done 2026-06-01 every 3 months is due on 2026-09-25', () => {
		const due = computeDue(
			sediment,
			[{ performedOn: '2026-06-01', meterReading: null }],
			[],
			'2026-09-25'
		);
		assert.equal(due.calendar?.dueOn, '2026-09-01');
		assert.equal(due.state, 'due');
		assert.equal(due.first, 'calendar');
	});

	test('pressure tank has no history', () => {
		assert.equal(computeDue(pressure, [], [], '2026-09-25').state, 'no_history');
	});
});

describe('due soon', () => {
	const monthly = { meterEvery: null, calendarEvery: 1, calendarUnit: 'months' as const };
	const done = [{ performedOn: '2026-10-01', meterReading: null }];

	test('within 14 days of the calendar date', () => {
		assert.equal(computeDue(monthly, done, [], '2026-10-18').state, 'due_soon');
		assert.equal(computeDue(monthly, done, [], '2026-10-17').state, 'not_due');
		assert.equal(computeDue(monthly, done, [], '2026-11-01').state, 'due');
	});

	test('meter projected from usage', () => {
		const hours = { meterEvery: 100, calendarEvery: null, calendarUnit: null };
		const readings = [
			{ value: 1000, readOn: '2026-10-01' },
			{ value: 1050, readOn: '2026-10-11' }
		];
		// 5 h/day, 50 hours left: projected 2026-10-21.
		const due = computeDue(
			hours,
			[{ performedOn: '2026-10-01', meterReading: 1000 }],
			readings,
			'2026-10-11'
		);
		assert.equal(due.meter?.projectedOn, '2026-10-21');
		assert.equal(due.state, 'due_soon');
	});

	test('meter interval is skipped when the last log has no reading', () => {
		const both = { meterEvery: 100, calendarEvery: 12, calendarUnit: 'months' as const };
		const due = computeDue(
			both,
			[{ performedOn: '2025-11-01', meterReading: null }],
			[{ value: 5000, readOn: '2026-10-01' }],
			'2026-11-03'
		);
		assert.equal(due.meter, null);
		assert.equal(due.calendar?.dueOn, '2026-11-01');
		assert.equal(due.state, 'due');
	});
});

describe('helpers', () => {
	test('addMonths clamps to the end of a shorter month', () => {
		assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
		assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
		assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
		assert.equal(addMonths('2025-11-01', 12), '2026-11-01');
	});

	test('the latest completion wins, and a date tie goes to the higher reading', () => {
		assert.deepEqual(
			lastCompletion([
				{ performedOn: '2026-05-01', meterReading: 900 },
				{ performedOn: '2026-05-01', meterReading: 910 },
				{ performedOn: '2026-04-01', meterReading: 950 }
			]),
			{ performedOn: '2026-05-01', meterReading: 910 }
		);
	});

	test('the current reading is the newest by date, even if it is lower', () => {
		// A replaced meter reads lower; an older log never lowers the current reading.
		assert.deepEqual(
			currentReading([
				{ value: 4000, readOn: '2026-01-01' },
				{ value: 12, readOn: '2026-02-01' }
			]),
			{ value: 12, readOn: '2026-02-01' }
		);
	});

	test('usage needs readings at least a week apart', () => {
		assert.equal(
			usageRate([
				{ value: 100, readOn: '2026-10-01' },
				{ value: 110, readOn: '2026-10-05' }
			]),
			null
		);
		assert.equal(
			usageRate([
				{ value: 100, readOn: '2026-10-01' },
				{ value: 170, readOn: '2026-10-15' }
			]),
			5
		);
	});

	test('todayIn uses the app timezone, not UTC', () => {
		// 03:00 UTC on Nov 4 is still Nov 3 in Chicago.
		const now = new Date('2026-11-04T03:00:00Z');
		assert.equal(todayIn('America/Chicago', now), '2026-11-03');
		assert.equal(todayIn('UTC', now), '2026-11-04');
	});

	test('worstState and describeInterval', () => {
		assert.equal(worstState(['not_due', 'due_soon', 'no_history']), 'due_soon');
		assert.equal(worstState(['no_history']), null);
		assert.equal(
			describeInterval({ meterEvery: 200, calendarEvery: 12, calendarUnit: 'months' }, 'hours'),
			'Every 200 hours or 12 months'
		);
		assert.equal(
			describeInterval({ meterEvery: null, calendarEvery: 1, calendarUnit: 'months' }, null),
			'Every 1 month'
		);
	});
});

describe('dueLabel: the chip says how far over or how soon', () => {
	const today = '2026-11-04';
	test('meter over, calendar not', () => {
		const oil = { meterEvery: 100, calendarEvery: 12, calendarUnit: 'months' as const };
		const due = computeDue(
			oil,
			[{ performedOn: '2026-06-01', meterReading: 400 }],
			[
				{ value: 400, readOn: '2026-06-01' },
				{ value: 520, readOn: '2026-11-01' }
			],
			today
		);
		assert.equal(dueLabel(due, 'h', today), '20 h over');
	});
	test('calendar over', () => {
		const yearly = { meterEvery: null, calendarEvery: 12, calendarUnit: 'months' as const };
		const due = computeDue(yearly, [{ performedOn: '2025-10-01', meterReading: null }], [], today);
		assert.equal(dueLabel(due, '', today), '34 d over');
	});
	test('calendar soon', () => {
		const grease = { meterEvery: null, calendarEvery: 30, calendarUnit: 'days' as const };
		const due = computeDue(grease, [{ performedOn: '2026-10-15', meterReading: 210 }], [], today);
		assert.equal(dueLabel(due, 'h', today), 'in 10 d');
	});
	test('meter projection soon is marked as an estimate', () => {
		const oil = { meterEvery: 5000, calendarEvery: 6, calendarUnit: 'months' as const };
		const due = computeDue(
			oil,
			[{ performedOn: '2026-08-01', meterReading: 40000 }],
			[
				{ value: 40000, readOn: '2026-08-01' },
				{ value: 43900, readOn: '2026-10-20' }
			],
			today
		);
		assert.equal(dueLabel(due, 'mi', today), 'in ~8 d');
	});
	test('no history and not due', () => {
		const job = { meterEvery: null, calendarEvery: 3, calendarUnit: 'months' as const };
		assert.equal(dueLabel(computeDue(job, [], [], today), '', today), 'No history');
		const fresh = computeDue(job, [{ performedOn: today, meterReading: null }], [], today);
		assert.equal(dueLabel(fresh, '', today), 'OK');
	});
});

// The app stores dueDates and compares them with today in SQL. Every day, for every kind of job,
// that must give the same state as computing from the whole history.
describe('stored dates match computing from history', () => {
	const jobs = [
		{ meterEvery: 250, calendarEvery: 12, calendarUnit: 'months' as const },
		{ meterEvery: 100, calendarEvery: null, calendarUnit: null },
		{ meterEvery: null, calendarEvery: 30, calendarUnit: 'days' as const },
		{ meterEvery: null, calendarEvery: 3, calendarUnit: 'months' as const }
	];
	const histories = [
		[],
		[{ performedOn: '2026-03-12', meterReading: 2200 }],
		[{ performedOn: '2026-06-01', meterReading: null }],
		[
			{ performedOn: '2025-11-02', meterReading: 1900 },
			{ performedOn: '2026-08-20', meterReading: 2390 }
		]
	];
	const readingSets = [
		[],
		[{ value: 2200, readOn: '2026-03-12' }],
		[
			{ value: 2200, readOn: '2026-03-12' },
			{ value: 2410, readOn: '2026-08-01' }
		],
		// Already past every meter interval above.
		[
			{ value: 2390, readOn: '2026-08-20' },
			{ value: 2700, readOn: '2026-10-01' }
		]
	];
	const days = Array.from({ length: 500 }, (_, i) => addDays('2026-01-01', i));

	test('job states', () => {
		for (const job of jobs)
			for (const completions of histories)
				for (const readings of readingSets) {
					const inputs = summarize(completions, readings);
					const dates = dueDates(job, inputs);
					for (const today of days) {
						const want = computeDue(job, completions, readings, today).state;
						assert.deepEqual(dueFrom(job, inputs, today).state, want);
						const flag = itemFlag(itemDates([dates]), today);
						const asFlag = {
							due: 'due',
							due_soon: 'due_soon',
							no_history: 'no_history',
							not_due: 'up_to_date'
						}[want];
						assert.equal(flag, asFlag, `${JSON.stringify({ job, completions, readings, today })}`);
					}
				}
	});

	test('an item takes its worst job', () => {
		const readings = readingSets[2];
		for (const today of days) {
			const states = jobs.map((job) => computeDue(job, histories[1], readings, today).state);
			const dates = jobs.map((job) => dueDates(job, summarize(histories[1], readings)));
			const want = states.includes('due')
				? 'due'
				: states.includes('due_soon')
					? 'due_soon'
					: states.includes('no_history')
						? 'no_history'
						: 'up_to_date';
			assert.equal(itemFlag(itemDates(dates), today), want, today);
		}
		assert.equal(itemFlag(itemDates([]), '2026-01-01'), null);
	});
});
