export const APP_NAME = 'Equipment Log';

export const STATUSES = [
	{ value: 'active', label: 'Active' },
	{ value: 'needs_service', label: 'Needs service' },
	{ value: 'out_of_service', label: 'Out of service' },
	{ value: 'retired', label: 'Retired' }
] as const;
export type Status = (typeof STATUSES)[number]['value'];

export const LOG_TYPES = [
	{ value: 'inspection', label: 'Inspection' },
	{ value: 'service', label: 'Service' },
	{ value: 'repair', label: 'Repair' },
	{ value: 'other', label: 'Other' }
] as const;
export type LogType = (typeof LOG_TYPES)[number]['value'];

export const CATEGORIES = [
	{ value: 'vehicle', label: 'Vehicles' },
	{ value: 'machinery', label: 'Machinery' },
	{ value: 'facility', label: 'Facility' }
] as const;
export type Category = (typeof CATEGORIES)[number]['value'];
export const categoryValues = CATEGORIES.map((c) => c.value) as [Category, ...Category[]];
export const categoryLabel = (value: string) =>
	CATEGORIES.find((c) => c.value === value)?.label ?? value;

// Suggested kinds for each category, from the cemetery-maintenance skill. Kind stays free text.
export const KINDS: Record<Category, string[]> = {
	vehicle: ['backhoe', 'excavator', 'tractor', 'utv', 'mower', 'truck', 'trailer'],
	machinery: ['well-pump', 'irrigation', 'compressor', 'generator'],
	facility: ['electrical', 'building', 'septic', 'fuel-tank']
};
export const categoryOfKind = (kind: string) =>
	(Object.keys(KINDS) as Category[]).find((c) => KINDS[c].includes(kind));

// No meter is stored as null.
export const METER_UNITS = [
	{ value: 'hours', label: 'Hours', short: 'h' },
	{ value: 'miles', label: 'Miles', short: 'mi' }
] as const;
export type MeterUnit = (typeof METER_UNITS)[number]['value'];
export const meterUnitValues = METER_UNITS.map((u) => u.value) as [MeterUnit, ...MeterUnit[]];
export const meterShort = (unit: string | null) =>
	METER_UNITS.find((u) => u.value === unit)?.short ?? '';

export const CALENDAR_UNITS = [
	{ value: 'days', label: 'Days' },
	{ value: 'months', label: 'Months' }
] as const;
export type CalendarUnit = (typeof CALENDAR_UNITS)[number]['value'];
export const calendarUnitValues = CALENDAR_UNITS.map((u) => u.value) as [
	CalendarUnit,
	...CalendarUnit[]
];

// A consumable on a service job, or a part installed on a log.
export type Part = { item: string; spec: string; qty: string };
export const MAX_SERVICE_JOBS = 50;
export const MAX_PARTS = 30;

// Quick entries on the add log page. Equipment without its own list uses these defaults.
export type LogPreset = { label: string; type: LogType; description: string };
export const MAX_LOG_PRESETS = 20;
export const DEFAULT_LOG_PRESETS: LogPreset[] = [
	{ label: 'Passed inspection', type: 'inspection', description: 'Inspected, no issues found.' },
	{ label: 'Issue found', type: 'inspection', description: 'Inspected, issue found:' },
	{ label: 'Routine service', type: 'service', description: 'Performed routine service.' },
	{ label: 'Cleaned', type: 'service', description: 'Cleaned.' }
];

export const statusValues = STATUSES.map((s) => s.value) as [Status, ...Status[]];
export const logTypeValues = LOG_TYPES.map((t) => t.value) as [LogType, ...LogType[]];

export const statusLabel = (value: string) =>
	STATUSES.find((s) => s.value === value)?.label ?? value;
export const logTypeLabel = (value: string) =>
	LOG_TYPES.find((t) => t.value === value)?.label ?? value;

export const formatDate = (isoDate: string) =>
	new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' });

// "Ron (entered by Nick)" when someone else did the work; otherwise the author. An imported log's
// author only imported it, so it shows who did the work or nothing.
export function doneBy(log: {
	performedBy: string | null;
	author: { name: string } | null;
	importKey?: string | null;
}) {
	if (!log.performedBy) return log.importKey ? null : (log.author?.name ?? null);
	const same = log.author?.name.toLowerCase() === log.performedBy.toLowerCase();
	return log.author && !same && !log.importKey
		? `${log.performedBy} (entered by ${log.author.name})`
		: log.performedBy;
}
