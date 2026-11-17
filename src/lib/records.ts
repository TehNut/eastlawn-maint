// Reads the cemetery-maintenance records (maintenance/records/ YAML files) into what the app
// stores. Pure, so the browser can preview an import and the server can re-check each record
// with the same rules. The rules follow the skill's schema.md.

import { z } from 'zod';
import {
	calendarUnitValues,
	categoryValues,
	logTypeValues,
	meterUnitValues,
	statusValues
} from './constants.ts';

export type Problem = { path: string; message: string; severity: 'error' | 'warning' };

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const kebab = z.string().regex(KEBAB, 'must be lowercase kebab-case');
const date = z.iso.date('must be a YYYY-MM-DD date');
// YAML turns `qty: 1` and `model: 310` into numbers.
const text = z.union([z.string(), z.number()]).transform((v) => String(v).trim());
const optionalText = text.optional().transform((v) => v || null);

// --- what the app imports, checked again on the server ---

const part = z.object({
	item: z.string().trim().min(1).max(200),
	spec: z.string().trim().max(500),
	qty: z.string().trim().max(200)
});

export const EquipmentImport = z
	.object({
		key: kebab.max(200),
		name: z.string().trim().min(1).max(500),
		category: z.enum(categoryValues),
		kind: z.string().max(60).nullable(),
		status: z.enum(statusValues),
		manufacturer: z.string().max(500).nullable(),
		model: z.string().max(500).nullable(),
		serialNumber: z.string().max(500).nullable(),
		year: z.number().int().min(1900).max(2100).nullable(),
		place: z.string().max(200).nullable(),
		operatorName: z.string().max(100).nullable(),
		meterUnit: z.enum(meterUnitValues).nullable(),
		reading: z.object({ value: z.number().min(0), readOn: date }).nullable(),
		notes: z.string().max(5000).nullable(),
		// Records path of the PDF beside the manual's markdown copy.
		manualPdf: z.string().max(500).nullable(),
		jobs: z
			.array(
				z.object({
					slug: kebab.max(200),
					name: z.string().trim().min(1).max(200),
					meterEvery: z.number().int().min(1).max(1_000_000).nullable(),
					calendarEvery: z.number().int().min(1).max(1_000_000).nullable(),
					calendarUnit: z.enum(calendarUnitValues).nullable(),
					consumables: z.array(part).max(30),
					notes: z.string().max(5000).nullable()
				})
			)
			.max(50)
	})
	.superRefine((e, ctx) => {
		for (const job of e.jobs) {
			if (!job.meterEvery && !job.calendarEvery)
				ctx.addIssue({ code: 'custom', message: `service ${job.slug} has no interval` });
			if (job.meterEvery && !e.meterUnit)
				ctx.addIssue({
					code: 'custom',
					message: `service ${job.slug} has a meter interval, but meter.unit is none`
				});
		}
		if (new Set(e.jobs.map((j) => j.slug)).size !== e.jobs.length)
			ctx.addIssue({ code: 'custom', message: 'service ids must be unique' });
	});
export type EquipmentImport = z.output<typeof EquipmentImport>;

export const LogImport = z.object({
	key: kebab.max(200),
	equipmentKey: kebab.max(200),
	performedOn: date,
	type: z.enum(logTypeValues),
	summary: z.string().max(200).nullable(),
	description: z.string().trim().min(1).max(5000),
	meterReading: z.number().min(0).nullable(),
	performedBy: z.string().max(100).nullable(),
	partsUsed: z.array(part).max(30),
	serviceSlugs: z.array(kebab).max(50),
	photos: z
		.array(z.object({ path: z.string().max(500), caption: z.string().max(300).nullable() }))
		.max(30)
});
export type LogImport = z.output<typeof LogImport>;

// --- the record files as the skill writes them ---

const RawPart = z.object({
	item: text,
	spec: optionalText.transform((v) => v ?? ''),
	qty: optionalText.transform((v) => v ?? '')
});

const RawService = z.object({
	id: kebab,
	name: z.string(),
	interval: z
		.object({
			meter: z.object({ every: z.number(), unit: z.enum(meterUnitValues) }).optional(),
			calendar: z.object({ every: z.number(), unit: z.enum(calendarUnitValues) }).optional()
		})
		.optional()
		.default({}),
	consumables: z.array(RawPart).nullish(),
	notes: z.string().nullish()
});

const RawEquipment = z.object({
	id: kebab,
	name: z.string(),
	category: z.enum(categoryValues),
	kind: z.string().nullish(),
	make: optionalText,
	model: optionalText,
	year: z.number().int().nullish(),
	serial: optionalText,
	location: z.string().nullish(),
	status: z.enum(['in-service', 'out-of-service', 'retired']),
	meter: z.object({
		unit: z.enum(['hours', 'miles', 'none']),
		reading: z.number().nullish(),
		read_on: date.nullish()
	}),
	service: z.array(RawService).nullish(),
	manual: z.string().nullish(),
	notes: z.string().nullish()
});

const RawLog = z.object({
	id: kebab,
	equipment_id: kebab,
	date,
	kind: z.enum(['scheduled', 'repair', 'inspection']),
	summary: z.string(),
	meter_reading: z.number().nullish(),
	performed_by: optionalText,
	work_done: z.string().nullish(),
	parts_used: z.array(RawPart).nullish(),
	service_ids: z.array(z.string()).nullish(),
	photos: z.array(z.object({ file: z.string(), caption: z.string().nullish() })).nullish()
});

const STATUS = {
	'in-service': 'active',
	'out-of-service': 'out_of_service',
	retired: 'retired'
} as const;
const LOG_TYPE = { scheduled: 'service', repair: 'repair', inspection: 'inspection' } as const;

const stem = (path: string) =>
	path
		.split('/')
		.pop()!
		.replace(/\.ya?ml$/, '');
const describe = (error: z.ZodError) =>
	error.issues
		.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
		.join('; ');
const clean = (v: string | null | undefined) => v?.trim() || null;

// "Primary user: Ron" lines in notes become the operator.
function splitOperator(notes: string | null | undefined) {
	let operatorName: string | null = null;
	const kept = (notes ?? '')
		.split('\n')
		.filter((line) => {
			const match = /^\s*Primary user:\s*(.+?)\s*$/i.exec(line);
			if (match && !operatorName) operatorName = match[1];
			return !match;
		})
		.join('\n')
		.trim();
	return { operatorName, notes: kept || null };
}

export type Entry = { path: string; data: unknown };

// entries: parsed equipment/*.yaml and logs/*.yaml files, with paths relative to records/.
// files: every path in the folder, to find manual PDFs and log pictures.
export function planImport(entries: Entry[], files: Set<string>) {
	const problems: Problem[] = [];
	const error = (path: string, message: string) =>
		problems.push({ path, message, severity: 'error' });
	const warn = (path: string, message: string) =>
		problems.push({ path, message, severity: 'warning' });

	const equipment: EquipmentImport[] = [];
	const seen = new Set<string>();
	for (const { path, data } of entries.filter((e) => e.path.startsWith('equipment/'))) {
		const raw = RawEquipment.safeParse(data);
		if (!raw.success) {
			error(path, describe(raw.error));
			continue;
		}
		const r = raw.data;
		if (r.id !== stem(path)) {
			error(path, `id ${r.id} doesn't match the filename`);
			continue;
		}
		if (seen.has(r.id)) {
			error(path, `id ${r.id} is used by another file`);
			continue;
		}
		const meterUnit = r.meter.unit === 'none' ? null : r.meter.unit;
		const jobs = (r.service ?? []).map((s) => ({
			slug: s.id,
			name: s.name.trim(),
			meterEvery: s.interval.meter?.every ?? null,
			calendarEvery: s.interval.calendar?.every ?? null,
			calendarUnit: s.interval.calendar?.unit ?? null,
			consumables: s.consumables ?? [],
			notes: clean(s.notes)
		}));
		const mismatched = (r.service ?? []).filter(
			(s) => s.interval.meter && s.interval.meter.unit !== meterUnit
		);
		if (mismatched.length) {
			error(
				path,
				`service ${mismatched.map((s) => s.id).join(', ')}: interval.meter.unit must match meter.unit (${r.meter.unit})`
			);
			continue;
		}

		let manualPdf: string | null = null;
		if (r.manual) {
			const pdf = `manuals/${stem(r.manual).replace(/\.md$/, '')}.pdf`;
			if (files.has(pdf)) manualPdf = pdf;
			else warn(path, `no PDF at ${pdf}, so the manual is skipped`);
		}
		const { operatorName, notes } = splitOperator(r.notes);
		const reading =
			meterUnit && r.meter.reading != null && r.meter.read_on
				? { value: r.meter.reading, readOn: r.meter.read_on }
				: null;

		const mapped = EquipmentImport.safeParse({
			key: r.id,
			name: r.name.trim(),
			category: r.category,
			kind: clean(r.kind),
			status: STATUS[r.status],
			manufacturer: r.make,
			model: r.model,
			serialNumber: r.serial,
			year: r.year ?? null,
			place: clean(r.location),
			operatorName,
			meterUnit,
			reading,
			notes,
			manualPdf,
			jobs
		});
		if (!mapped.success) {
			error(path, describe(mapped.error));
			continue;
		}
		seen.add(r.id);
		equipment.push(mapped.data);
	}

	const byKey = new Map(equipment.map((e) => [e.key, e]));
	const logs: LogImport[] = [];
	const seenLogs = new Set<string>();
	for (const { path, data } of entries.filter((e) => e.path.startsWith('logs/'))) {
		const raw = RawLog.safeParse(data);
		if (!raw.success) {
			error(path, describe(raw.error));
			continue;
		}
		const r = raw.data;
		if (r.id !== stem(path)) {
			error(path, `id ${r.id} doesn't match the filename`);
			continue;
		}
		if (seenLogs.has(r.id)) {
			error(path, `id ${r.id} is used by another file`);
			continue;
		}
		const item = byKey.get(r.equipment_id);
		if (!item) {
			error(path, `equipment_id ${r.equipment_id} has no valid equipment file`);
			continue;
		}
		const slugs = new Set(item.jobs.map((j) => j.slug));
		const unknown = (r.service_ids ?? []).filter((id) => !slugs.has(id));
		if (unknown.length) {
			error(path, `service_ids ${unknown.join(', ')} aren't services on ${r.equipment_id}`);
			continue;
		}
		let meterReading = r.meter_reading ?? null;
		if (meterReading != null && !item.meterUnit) {
			warn(path, `${r.equipment_id} has no meter, so meter_reading is dropped`);
			meterReading = null;
		}
		const photos = (r.photos ?? []).flatMap((p) => {
			const photoPath = `logs/${r.id}/${p.file}`;
			if (files.has(photoPath)) return [{ path: photoPath, caption: clean(p.caption) }];
			warn(path, `picture ${p.file} isn't in logs/${r.id}/, so it is skipped`);
			return [];
		});

		const mapped = LogImport.safeParse({
			key: r.id,
			equipmentKey: r.equipment_id,
			performedOn: r.date,
			type: LOG_TYPE[r.kind],
			summary: clean(r.summary),
			// The app needs a description; a log with only a summary uses that.
			description: clean(r.work_done) ?? r.summary.trim(),
			meterReading,
			performedBy: r.performed_by,
			partsUsed: r.parts_used ?? [],
			serviceSlugs: r.service_ids ?? [],
			photos
		});
		if (!mapped.success) {
			error(path, describe(mapped.error));
			continue;
		}
		seenLogs.add(r.id);
		logs.push(mapped.data);
	}

	return { equipment, logs, problems };
}

// Finds the records folder inside whatever was picked (records/ itself, or maintenance/ above it)
// and returns paths relative to it. Null if there's no equipment folder.
export function recordsRoot(paths: string[]) {
	const hit = paths.find((p) => /(^|\/)equipment\/[^/]+\.ya?ml$/.test(p));
	if (!hit) return null;
	return hit.slice(0, hit.lastIndexOf('equipment/'));
}

export const isRecordYaml = (path: string) => /^(equipment|logs)\/[^/]+\.ya?ml$/.test(path);
