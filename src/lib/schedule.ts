// Due-date rules for service jobs. A state depends on today, so it is never stored. What is
// stored, whenever a log, reading or job changes, is everything it depends on besides today: each
// job's last completion and the item's current reading and usage rate (DueInputs), plus the dates
// the item turns due and due soon (dueDates), which SQL can compare with today. Pure functions,
// so they run in tests without D1. Dates are calendar dates (YYYY-MM-DD) throughout.

import type { CalendarUnit } from './constants';

export const DUE_SOON_DAYS = 14;
// Usage is averaged over readings at least this far apart, so two readings on the same day
// can't project a wild rate.
const MIN_RATE_SPAN_DAYS = 7;

export type Interval = {
	meterEvery: number | null;
	calendarEvery: number | null;
	calendarUnit: CalendarUnit | null;
};
export type Completion = { performedOn: string; meterReading: number | null };
export type Reading = { value: number; readOn: string };

export type DueState = 'due' | 'due_soon' | 'not_due' | 'no_history';

export type Due = {
	state: DueState;
	last: Completion | null;
	// Present when the job has a meter interval and the last completion has a reading.
	meter: { dueAt: number; remaining: number | null; projectedOn: string | null } | null;
	// Present when the job has a calendar interval and a last completion.
	calendar: { dueOn: string; daysLeft: number } | null;
	// Which threshold arrives first, when both exist.
	first: 'meter' | 'calendar' | null;
};

const DAY_MS = 86_400_000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const daysBetween = (from: string, to: string) =>
	Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

export const addDays = (date: string, days: number) => fromUtc(toUtc(date) + days * DAY_MS);

// Clamps to the end of a shorter month: Jan 31 plus one month is Feb 28 (or 29).
export function addMonths(date: string, months: number) {
	const [y, m, d] = date.split('-').map(Number);
	const total = y * 12 + (m - 1) + months;
	const year = Math.floor(total / 12);
	const month = total % 12;
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return fromUtc(Date.UTC(year, month, Math.min(d, lastDay)));
}

// Today in the app's timezone. Never UTC: a log entered in the evening must count as today.
export const todayIn = (timeZone: string, now = new Date()) =>
	new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);

// The newest reading by date, and on a tie the higher value. A log from before the current
// reading never replaces it.
export function currentReading(readings: Reading[]): Reading | null {
	let best: Reading | null = null;
	for (const r of readings) {
		if (!best || r.readOn > best.readOn || (r.readOn === best.readOn && r.value > best.value))
			best = r;
	}
	return best;
}

// Units per day, from the current reading and the latest one at least a week before it.
export function usageRate(readings: Reading[]): number | null {
	const latest = currentReading(readings);
	if (!latest) return null;
	const earlier = currentReading(
		readings.filter((r) => daysBetween(r.readOn, latest.readOn) >= MIN_RATE_SPAN_DAYS)
	);
	if (!earlier) return null;
	const rate = (latest.value - earlier.value) / daysBetween(earlier.readOn, latest.readOn);
	return rate > 0 ? rate : null;
}

// The latest completion by date, and on a tie the higher meter reading.
export function lastCompletion(completions: Completion[]): Completion | null {
	let best: Completion | null = null;
	for (const c of completions) {
		if (
			!best ||
			c.performedOn > best.performedOn ||
			(c.performedOn === best.performedOn && (c.meterReading ?? -1) > (best.meterReading ?? -1))
		)
			best = c;
	}
	return best;
}

// A job's due state from its whole history. The app stores the summary instead; see dueFrom.
export function computeDue(
	job: Interval,
	completions: Completion[],
	readings: Reading[],
	today: string
): Due {
	return dueFrom(job, summarize(completions, readings), today);
}

// What a job's state depends on besides today, summarised from its history.
export type DueInputs = { last: Completion | null; reading: Reading | null; rate: number | null };
export const summarize = (completions: Completion[], readings: Reading[]): DueInputs => ({
	last: lastCompletion(completions),
	reading: currentReading(readings),
	rate: usageRate(readings)
});

export function dueFrom(job: Interval, { last, reading, rate }: DueInputs, today: string): Due {
	if (!last) return { state: 'no_history', last: null, meter: null, calendar: null, first: null };

	const calendarDueOn = calendarDate(job, last);
	const calendar: Due['calendar'] = calendarDueOn
		? { dueOn: calendarDueOn, daysLeft: daysBetween(today, calendarDueOn) }
		: null;

	const meter = meterSide(job, last, reading, rate);

	const meterDue = meter?.remaining != null && meter.remaining <= 0;
	const calendarDue = calendar != null && calendar.daysLeft <= 0;
	const meterSoon =
		meter?.projectedOn != null && daysBetween(today, meter.projectedOn) <= DUE_SOON_DAYS;
	const calendarSoon = calendar != null && calendar.daysLeft <= DUE_SOON_DAYS;

	const state: DueState =
		meterDue || calendarDue ? 'due' : meterSoon || calendarSoon ? 'due_soon' : 'not_due';

	let first: Due['first'] = null;
	if (meter && calendar) {
		// Whichever is already due; otherwise compare dates when the meter side can be projected.
		// With no usage rate there's no honest way to order them, so the UI shows both.
		if (meterDue !== calendarDue) first = meterDue ? 'meter' : 'calendar';
		else if (meter.projectedOn) first = meter.projectedOn < calendar.dueOn ? 'meter' : 'calendar';
	} else first = meter ? 'meter' : calendar ? 'calendar' : null;

	return { state, last, meter, calendar, first };
}

function calendarDate(job: Interval, last: Completion) {
	if (!job.calendarEvery || !job.calendarUnit) return null;
	return job.calendarUnit === 'months'
		? addMonths(last.performedOn, job.calendarEvery)
		: addDays(last.performedOn, job.calendarEvery);
}

function meterSide(
	job: Interval,
	last: Completion,
	now: Reading | null,
	rate: number | null
): Due['meter'] {
	if (!job.meterEvery || last.meterReading == null) return null;
	const dueAt = last.meterReading + job.meterEvery;
	const remaining = now ? dueAt - now.value : null;
	const projectedOn =
		now && rate && remaining != null && remaining > 0
			? addDays(now.readOn, Math.ceil(remaining / rate))
			: null;
	return { dueAt, remaining, projectedOn };
}

// Sorts before every date: a job already over its meter interval is due whatever today is.
export const ALWAYS = '0000-00-00';
const earliest = (dates: (string | null)[]) =>
	dates.reduce<string | null>((min, d) => (d && (!min || d < min) ? d : min), null);

// The dates a job turns due and due soon. Neither depends on today, so they can be stored: the
// job is due when dueOn <= today and due soon when soonOn <= today + DUE_SOON_DAYS, exactly as
// dueFrom decides. Null means never by date.
export function dueDates(job: Interval, { last, reading, rate }: DueInputs) {
	if (!last) return { dueOn: null, soonOn: null, unlogged: true };
	const calendarDueOn = calendarDate(job, last);
	const meter = meterSide(job, last, reading, rate);
	const meterDue = meter?.remaining != null && meter.remaining <= 0;
	return {
		dueOn: earliest([calendarDueOn, meterDue ? ALWAYS : null]),
		soonOn: earliest([calendarDueOn, meter?.projectedOn ?? null]),
		unlogged: false
	};
}

// What an item's stored dates add up to: the earliest of its jobs'.
export function itemDates(jobs: ReturnType<typeof dueDates>[]) {
	return {
		dueOn: earliest(jobs.map((j) => j.dueOn)),
		soonOn: earliest(jobs.map((j) => j.soonOn)),
		unloggedJobs: jobs.filter((j) => j.unlogged).length,
		jobCount: jobs.length
	};
}

export const FLAGS = ['due', 'due_soon', 'no_history', 'up_to_date'] as const;
export type Flag = (typeof FLAGS)[number];

// An item's flag from its stored dates: its worst job. Null when it has no service jobs.
export function itemFlag(
	item: { dueOn: string | null; soonOn: string | null; unloggedJobs: number; jobCount: number },
	today: string
): Flag | null {
	if (!item.jobCount) return null;
	if (item.dueOn && item.dueOn <= today) return 'due';
	if (item.soonOn && item.soonOn <= addDays(today, DUE_SOON_DAYS)) return 'due_soon';
	return item.unloggedJobs ? 'no_history' : 'up_to_date';
}

const RANK: Record<DueState, number> = { due: 0, due_soon: 1, no_history: 2, not_due: 3 };
export const byUrgency = (a: DueState, b: DueState) => RANK[a] - RANK[b];

// The worst state across an item's jobs, for its chip. No history doesn't earn a chip.
export function worstState(states: DueState[]): 'due' | 'due_soon' | null {
	if (states.includes('due')) return 'due';
	if (states.includes('due_soon')) return 'due_soon';
	return null;
}

// The chip text: how far over, or how soon. "~" marks a date projected from meter use.
// unit is the meter's short unit ("h", "mi").
export function dueLabel(due: Due, unit: string, today: string) {
	if (due.state === 'no_history') return 'No history';
	if (due.state === 'not_due') return 'OK';
	const { meter, calendar } = due;
	if (due.state === 'due') {
		const meterOver = meter?.remaining != null && meter.remaining <= 0;
		const calendarOver = calendar != null && calendar.daysLeft <= 0;
		if (meterOver && (!calendarOver || due.first !== 'calendar')) {
			return meter!.remaining === 0 ? 'Due now' : `${-meter!.remaining!} ${unit} over`;
		}
		return calendar!.daysLeft === 0 ? 'Due today' : `${-calendar!.daysLeft} d over`;
	}
	const projected = meter?.projectedOn ? daysBetween(today, meter.projectedOn) : null;
	if (projected != null && (calendar == null || projected < calendar.daysLeft)) {
		return `in ~${projected} d`;
	}
	return `in ${calendar!.daysLeft} d`;
}

export function describeInterval(job: Interval, meterUnit: string | null) {
	const parts: string[] = [];
	if (job.meterEvery) parts.push(`${job.meterEvery} ${meterUnit ?? ''}`.trim());
	if (job.calendarEvery && job.calendarUnit) {
		const unit = job.calendarEvery === 1 ? job.calendarUnit.slice(0, -1) : job.calendarUnit;
		parts.push(`${job.calendarEvery} ${unit}`);
	}
	return parts.length ? `Every ${parts.join(' or ')}` : '';
}
