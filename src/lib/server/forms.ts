import { z } from 'zod';
import {
	calendarUnitValues,
	categoryValues,
	logTypeValues,
	MAX_LOG_PRESETS,
	MAX_PARTS,
	MAX_SERVICE_JOBS,
	meterUnitValues,
	statusValues
} from '$lib/constants';

const required = (label: string) =>
	z
		.string({ error: `${label} is required` })
		.trim()
		.min(1, `${label} is required`)
		.max(500);
const optional = (max = 500) =>
	z
		.string()
		.trim()
		.max(max)
		.nullish()
		.transform((v) => v || null);

const Location = z.object({ name: required('Name'), address: optional() });

const Equipment = z.object({
	name: required('Name'),
	locationId: required('Location'),
	status: z.enum(statusValues),
	category: z.enum(categoryValues),
	meterUnit: z
		.enum(['', ...meterUnitValues])
		.optional()
		.transform((v) => v || null),
	manufacturer: optional(),
	model: optional(),
	serialNumber: optional(),
	kind: z
		.string()
		.trim()
		.toLowerCase()
		.max(60)
		.transform((v) => v.replace(/\s+/g, '-') || null)
		.optional()
		.transform((v) => v ?? null),
	year: z
		.string()
		.trim()
		.optional()
		.transform((v, ctx) => {
			if (!v) return null;
			const n = Number(v);
			if (!Number.isInteger(n) || n < 1900 || n > 2100) {
				ctx.addIssue({ code: 'custom', message: 'Enter a valid year' });
				return z.NEVER;
			}
			return n;
		}),
	place: optional(200),
	operatorName: optional(100),
	attachedToId: optional(32),
	notes: optional(5000)
});

// Empty means not entered. Readings are whole or decimal, never negative.
const reading = z
	.string()
	.trim()
	.optional()
	.transform((v, ctx) => {
		if (!v) return null;
		const n = Number(v);
		if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
			ctx.addIssue({ code: 'custom', message: 'Enter a valid meter reading' });
			return z.NEVER;
		}
		return n;
	});

const Log = z.object({
	type: z.enum(logTypeValues),
	summary: optional(200),
	description: z.string().trim().min(1, 'Describe what was done').max(5000),
	performedOn: z.iso.date('Enter a valid date'),
	meterReading: reading,
	performedBy: optional(100),
	status: z.enum(statusValues).optional()
});

const Reading = z.object({
	value: reading.refine((v) => v != null, 'Enter the meter reading'),
	readOn: z.iso.date('Enter a valid date')
});

const Parts = z
	.array(
		z.object({
			item: z.string().trim().min(1, 'Name every part').max(200),
			// Empty when the spec is confirmed unknown.
			spec: z.string().trim().max(500),
			qty: z.string().trim().max(200)
		})
	)
	.max(MAX_PARTS, `Keep it to ${MAX_PARTS} parts`);

const whole = (label: string) =>
	z
		.number({ error: `${label} must be a number` })
		.int(`${label} must be a whole number`)
		.min(1, `${label} must be at least 1`)
		.max(1_000_000)
		.nullable();

const ServiceJobs = z
	.array(
		z
			.object({
				// Present for jobs that already exist; new ones get an id on save.
				id: z.string().max(32).optional(),
				name: z.string().trim().min(1, 'Name every service job').max(200),
				meterEvery: whole('Meter interval'),
				calendarEvery: whole('Calendar interval'),
				calendarUnit: z.enum(calendarUnitValues).nullable(),
				consumables: Parts,
				notes: z
					.string()
					.trim()
					.max(5000)
					.transform((v) => v || null)
			})
			.refine((j) => j.meterEvery || j.calendarEvery, {
				message: 'Give every service job an interval'
			})
			.transform((j) => ({
				...j,
				calendarUnit: j.calendarEvery ? (j.calendarUnit ?? 'months') : null
			}))
	)
	.max(MAX_SERVICE_JOBS, `Keep it to ${MAX_SERVICE_JOBS} service jobs`);

const LogPresets = z
	.array(
		z.object({
			label: z.string().trim().min(1, 'Give every preset a label').max(40),
			type: z.enum(logTypeValues),
			description: z.string().trim().min(1, 'Give every preset some log text').max(5000)
		})
	)
	.max(MAX_LOG_PRESETS, `Keep it to ${MAX_LOG_PRESETS} presets`);

// A new question, and the chat it continues (none starts one). History comes from the database.
export const ChatQuestion = z.object({
	chatId: z.string().max(32).nullable().default(null),
	content: z.string().trim().min(1).max(8000)
});

const NewUser = z.object({
	name: required('Name'),
	email: z.email('Enter a valid email').max(254),
	password: z.string().min(8, 'Password must be at least 8 characters').max(128)
});

const Password = NewUser.pick({ password: true });

// What the AI may change. Everything is optional because it's a partial update.
// Empty becomes null, as in the forms.
const text = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((v) => v || null)
		.optional();
export const AiEquipmentPatch = z.strictObject({
	name: z.string().trim().min(1).max(500).optional(),
	status: z.enum(statusValues).optional(),
	manufacturer: text(500),
	model: text(500),
	serialNumber: text(500),
	notes: text(5000)
});
export const AiLog = z.strictObject({
	type: z.enum(logTypeValues),
	description: z.string().trim().min(1).max(5000),
	performedOn: z.iso.date().optional(),
	meterReading: z.number().min(0).max(10_000_000).optional()
});

// The text the browser extracted from an uploaded PDF.
const ManualText = z.object({
	pageCount: z.number().int().min(1).max(20000),
	pages: z
		.array(z.object({ page: z.number().int().min(1), text: z.string().max(200_000) }))
		.max(20000)
});

function parse<T extends z.ZodType>(schema: T, form: FormData) {
	const result = schema.safeParse(Object.fromEntries(form));
	return result.success
		? { success: true as const, data: result.data as z.output<T> }
		: { success: false as const, error: result.error.issues[0].message };
}

export const parseLocation = (form: FormData) => parse(Location, form);
export const parseEquipment = (form: FormData) => parse(Equipment, form);
function parseJson<T extends z.ZodType>(schema: T, json: string, what: string) {
	let value: unknown;
	try {
		value = JSON.parse(json);
	} catch {
		return { success: false as const, error: `Could not read those ${what}` };
	}
	const result = schema.safeParse(value);
	return result.success
		? { success: true as const, data: result.data as z.output<T> }
		: { success: false as const, error: result.error.issues[0].message };
}

// A log form: the fields, plus the parts list (JSON) and the jobs it completed (repeated field).
export function parseLog(form: FormData) {
	const log = parse(Log, form);
	if (!log.success) return log;
	const parts = parseJson(Parts, String(form.get('partsUsed') ?? '[]'), 'parts');
	if (!parts.success) return parts;
	const serviceJobIds = [...new Set(form.getAll('serviceJobIds').map(String))].slice(
		0,
		MAX_SERVICE_JOBS
	);
	return {
		success: true as const,
		data: { ...log.data, partsUsed: parts.data, serviceJobIds }
	};
}
export const parseLogPresets = (json: string) => parseJson(LogPresets, json, 'presets');
export const parseServiceJobs = (json: string) => parseJson(ServiceJobs, json, 'service jobs');
export const parseManualText = (json: string) => parseJson(ManualText, json, 'PDF pages');
// For other JSON form fields: the parsed value, or null.
export function parseJsonField<T extends z.ZodType>(schema: T, value: FormDataEntryValue | null) {
	const result = parseJson(schema, String(value), 'fields');
	return result.success ? result.data : null;
}

const Standards = z
	.array(
		z.object({
			id: z.string().max(32).optional(),
			product: z.string().trim().min(1, 'Name every product').max(100),
			matches: z
				.string()
				.trim()
				.toLowerCase()
				.min(1, 'Give every standard a keyword to match')
				.max(200),
			brand: z.string().trim().min(1, 'Give every standard a brand').max(100),
			crossFormat: z.boolean(),
			notes: z
				.string()
				.trim()
				.max(1000)
				.transform((v) => v || null)
		})
	)
	.max(50, 'Keep it to 50 standards');
export const parseStandards = (json: string) => parseJson(Standards, json, 'standards');
export const parseReading = (form: FormData) => parse(Reading, form);
export const parseNewUser = (form: FormData) => parse(NewUser, form);
export const parsePassword = (form: FormData) => parse(Password, form);
