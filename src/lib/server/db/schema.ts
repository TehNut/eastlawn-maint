import { relations, sql } from 'drizzle-orm';
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	unique,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import type {
	CalendarUnit,
	Category,
	LogPreset,
	LogType,
	MeterUnit,
	Part,
	Status
} from '$lib/constants';
import type { Citation, Part as ChatPart, Source } from '$lib/chat';
import type { Permission } from '$lib/permissions';

export const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 16);

const id = () => text('id').primaryKey().$defaultFn(newId);
const timestamp = (name: string) =>
	integer(name, { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

// --- better-auth tables ---

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
	image: text('image'),
	permissions: text('permissions', { mode: 'json' }).$type<Permission[]>().notNull().default([]),
	// Null sees every location. Restrict, because set null would silently widen this user's access.
	locationId: text('location_id').references(() => location.id, { onDelete: 'restrict' }),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' })
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at')
	},
	(t) => [index('account_user_idx').on(t.userId)]
);

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at')
});

// --- app tables ---

// One row per distinct PDF. The row id is also the storage key, under manuals/.
export const manual = sqliteTable('manual', {
	id: id(),
	name: text('name').notNull(),
	sha256: text('sha256').notNull().unique(),
	size: integer('size').notNull(),
	pageCount: integer('page_count').notNull(),
	// Zero for scanned PDFs: readable, but the AI has nothing to search.
	chunkCount: integer('chunk_count').notNull(),
	createdAt: timestamp('created_at')
});

// Indexed for full-text search by the manual_chunk_fts table and its triggers, which live in a
// hand-written migration because Drizzle can't express FTS5 virtual tables.
export const manualChunk = sqliteTable(
	'manual_chunk',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		manualId: text('manual_id')
			.notNull()
			.references(() => manual.id, { onDelete: 'cascade' }),
		page: integer('page').notNull(),
		text: text('text').notNull()
	},
	(t) => [index('chunk_manual_idx').on(t.manualId)]
);

// App-wide settings an admin can change, one row per key.
export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const location = sqliteTable('location', {
	id: id(),
	name: text('name').notNull(),
	address: text('address'),
	createdAt: timestamp('created_at')
});

export const equipment = sqliteTable(
	'equipment',
	{
		id: id(),
		name: text('name').notNull(),
		// A location with equipment in it can't be deleted.
		locationId: text('location_id')
			.notNull()
			.references(() => location.id, { onDelete: 'restrict' }),
		status: text('status').$type<Status>().notNull().default('active'),
		category: text('category').$type<Category>().notNull().default('vehicle'),
		// Free-text kebab-case type within the category: tractor, well-pump, septic…
		kind: text('kind'),
		// Null means no meter: calendar intervals only.
		meterUnit: text('meter_unit').$type<MeterUnit>(),
		manufacturer: text('manufacturer'),
		model: text('model'),
		serialNumber: text('serial_number'),
		year: integer('year'),
		// Where it sits within its location: "Shop bay 2".
		place: text('place'),
		// Free text: operators don't all have accounts.
		operatorName: text('operator_name'),
		// A trailer hitched to a tractor. One level only: an attached item has no attachments of
		// its own. It takes its parent's location.
		attachedToId: text('attached_to_id').references((): AnySQLiteColumn => equipment.id, {
			onDelete: 'set null'
		}),
		// Shared between items of the same model, so a manual is stored once.
		manualId: text('manual_id').references(() => manual.id, { onDelete: 'set null' }),
		notes: text('notes'),
		// Null means the defaults; an empty list means this item has no presets.
		logPresets: text('log_presets', { mode: 'json' }).$type<LogPreset[]>(),
		// The records file id it was imported from, so a second import skips it.
		importKey: text('import_key').unique(),
		// Due summary, rewritten by refreshDue whenever a log, reading or service job changes, so
		// lists never read history. See $lib/schedule. The current reading and usage rate:
		readingValue: real('reading_value'),
		readingOn: text('reading_on'),
		usageRate: real('usage_rate'),
		// Earliest date any job is due, and earliest date one comes due by calendar or projected
		// meter use (due soon from DUE_SOON_DAYS before). Null for never.
		dueOn: text('due_on'),
		soonOn: text('soon_on'),
		unloggedJobs: integer('unlogged_jobs').notNull().default(0),
		jobCount: integer('job_count').notNull().default(0),
		createdAt: timestamp('created_at')
	},
	(t) => [
		index('equipment_location_idx').on(t.locationId),
		// The equipment list's order, so a page stops after its rows.
		index('equipment_list_idx').on(sql`(${t.status} = 'retired')`, t.name, t.id)
	]
);

export const maintenanceLog = sqliteTable(
	'maintenance_log',
	{
		id: id(),
		equipmentId: text('equipment_id')
			.notNull()
			.references(() => equipment.id, { onDelete: 'cascade' }),
		type: text('type').$type<LogType>().notNull(),
		description: text('description').notNull(),
		// One-line title for lists. Falls back to the first line of the description.
		summary: text('summary'),
		// Calendar date (YYYY-MM-DD) as entered, so it never shifts between timezones.
		performedOn: text('performed_on').notNull(),
		// The meter when the work was done. Also written to meter_reading, linked by logId.
		meterReading: real('meter_reading'),
		// Free-text name when someone other than the author did the work.
		performedBy: text('performed_by'),
		// What was actually installed, which can differ from the job's consumables.
		partsUsed: text('parts_used', { mode: 'json' }).$type<Part[]>().notNull().default([]),
		// The account that entered the log. For an imported log, the admin who imported it.
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		// The records file id it was imported from, so a second import skips it.
		importKey: text('import_key').unique(),
		createdAt: timestamp('created_at')
	},
	// Both match the newest-first order the lists page through, so a page stops after its rows.
	(t) => [
		index('log_equipment_idx').on(t.equipmentId, t.performedOn, t.createdAt, t.id),
		index('log_recent_idx').on(t.performedOn, t.createdAt, t.id)
	]
);

// A repeating job on one item. Due dates are computed from the logs that completed it, never stored.
export const serviceJob = sqliteTable(
	'service_job',
	{
		id: id(),
		equipmentId: text('equipment_id')
			.notNull()
			.references(() => equipment.id, { onDelete: 'cascade' }),
		// Stable kebab-case key, unique per item, set once from the first name. Matches the records'
		// service ids for import.
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		// In the item's meter unit. At least one of meter or calendar is set.
		meterEvery: integer('meter_every'),
		calendarEvery: integer('calendar_every'),
		calendarUnit: text('calendar_unit').$type<CalendarUnit>(),
		consumables: text('consumables', { mode: 'json' }).$type<Part[]>().notNull().default([]),
		notes: text('notes'),
		sortOrder: integer('sort_order').notNull().default(0),
		// The latest log that completed it, kept by refreshDue.
		lastDoneOn: text('last_done_on'),
		lastDoneMeter: real('last_done_meter'),
		createdAt: timestamp('created_at')
	},
	(t) => [unique('service_job_slug').on(t.equipmentId, t.slug)]
);

// Which jobs a log completed. Both sides belong to the same item.
export const logServiceJob = sqliteTable(
	'log_service_job',
	{
		logId: text('log_id')
			.notNull()
			.references(() => maintenanceLog.id, { onDelete: 'cascade' }),
		serviceJobId: text('service_job_id')
			.notNull()
			.references(() => serviceJob.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.logId, t.serviceJobId] }),
		index('lsj_job_idx').on(t.serviceJobId)
	]
);

// Meter readings, from logs (logId set) or taken on their own. The current reading is the one
// with the latest date.
export const meterReading = sqliteTable(
	'meter_reading',
	{
		id: id(),
		equipmentId: text('equipment_id')
			.notNull()
			.references(() => equipment.id, { onDelete: 'cascade' }),
		logId: text('log_id').references(() => maintenanceLog.id, { onDelete: 'cascade' }),
		value: real('value').notNull(),
		readOn: text('read_on').notNull(),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at')
	},
	(t) => [
		index('reading_equipment_idx').on(t.equipmentId, t.readOn),
		unique('reading_log').on(t.logId)
	]
);

// logId is null for photos of the equipment itself. The row id is also the storage key.
export const photo = sqliteTable(
	'photo',
	{
		id: id(),
		equipmentId: text('equipment_id')
			.notNull()
			.references(() => equipment.id, { onDelete: 'cascade' }),
		logId: text('log_id').references(() => maintenanceLog.id, { onDelete: 'cascade' }),
		contentType: text('content_type').notNull(),
		caption: text('caption'),
		createdAt: timestamp('created_at')
	},
	(t) => [index('photo_equipment_idx').on(t.equipmentId), index('photo_log_idx').on(t.logId)]
);

// A saved manual page, kept on an item and optionally under one of its service jobs. Replaces
// saving screenshots of manual pages.
export const manualBookmark = sqliteTable(
	'manual_bookmark',
	{
		id: id(),
		manualId: text('manual_id')
			.notNull()
			.references(() => manual.id, { onDelete: 'cascade' }),
		equipmentId: text('equipment_id')
			.notNull()
			.references(() => equipment.id, { onDelete: 'cascade' }),
		serviceJobId: text('service_job_id').references(() => serviceJob.id, { onDelete: 'set null' }),
		page: integer('page').notNull(),
		label: text('label').notNull(),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at')
	},
	(t) => [index('bookmark_equipment_idx').on(t.equipmentId)]
);

// The fleet's one brand per product, from the cemetery-maintenance skill. Consumables whose item
// matches a keyword get the brand as a hint, and a warning when the spec names another brand.
export const productStandard = sqliteTable('product_standard', {
	id: id(),
	product: text('product').notNull(),
	// Comma-separated, lowercase: "engine oil".
	matches: text('matches').notNull(),
	brand: text('brand').notNull(),
	// Offer the "<brand> <number>, crosses to <oem>" spec helper, as for NAPA filters.
	crossFormat: integer('cross_format', { mode: 'boolean' }).notNull().default(false),
	notes: text('notes'),
	sortOrder: integer('sort_order').notNull().default(0)
});

// Assistant conversations, private to the user who had them. A chat started from an item's Ask
// page belongs to that item; the general assistant's have none.
export const chat = sqliteTable(
	'chat',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		equipmentId: text('equipment_id').references(() => equipment.id, { onDelete: 'cascade' }),
		// The first question, shortened.
		title: text('title').notNull(),
		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at')
	},
	(t) => [index('chat_user_idx').on(t.userId, t.equipmentId, t.updatedAt)]
);

export const chatMessage = sqliteTable(
	'chat_message',
	{
		// Increasing, so it orders the conversation: a question and its reply can share a second.
		id: integer('id').primaryKey({ autoIncrement: true }),
		chatId: text('chat_id')
			.notNull()
			.references(() => chat.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['user', 'assistant'] }).notNull(),
		content: text('content').notNull(),
		// The reply's steps and citations, kept so a reopened chat shows what it showed.
		parts: text('parts', { mode: 'json' }).$type<ChatPart[]>(),
		citations: text('citations', { mode: 'json' }).$type<Citation[]>(),
		sources: text('sources', { mode: 'json' }).$type<Source[]>(),
		createdAt: timestamp('created_at')
	},
	(t) => [index('chat_message_chat_idx').on(t.chatId, t.id)]
);

export const locationRelations = relations(location, ({ many }) => ({
	equipment: many(equipment)
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
	location: one(location, { fields: [equipment.locationId], references: [location.id] }),
	manual: one(manual, { fields: [equipment.manualId], references: [manual.id] }),
	logs: many(maintenanceLog),
	photos: many(photo),
	serviceJobs: many(serviceJob),
	readings: many(meterReading),
	bookmarks: many(manualBookmark),
	attachedTo: one(equipment, {
		fields: [equipment.attachedToId],
		references: [equipment.id],
		relationName: 'attachments'
	}),
	attachments: many(equipment, { relationName: 'attachments' })
}));

export const manualBookmarkRelations = relations(manualBookmark, ({ one }) => ({
	equipment: one(equipment, { fields: [manualBookmark.equipmentId], references: [equipment.id] }),
	manual: one(manual, { fields: [manualBookmark.manualId], references: [manual.id] }),
	serviceJob: one(serviceJob, {
		fields: [manualBookmark.serviceJobId],
		references: [serviceJob.id]
	})
}));

export const maintenanceLogRelations = relations(maintenanceLog, ({ one, many }) => ({
	equipment: one(equipment, { fields: [maintenanceLog.equipmentId], references: [equipment.id] }),
	author: one(user, { fields: [maintenanceLog.authorId], references: [user.id] }),
	photos: many(photo),
	serviceJobs: many(logServiceJob)
}));

export const serviceJobRelations = relations(serviceJob, ({ one, many }) => ({
	equipment: one(equipment, { fields: [serviceJob.equipmentId], references: [equipment.id] }),
	logs: many(logServiceJob)
}));

export const logServiceJobRelations = relations(logServiceJob, ({ one }) => ({
	log: one(maintenanceLog, { fields: [logServiceJob.logId], references: [maintenanceLog.id] }),
	serviceJob: one(serviceJob, {
		fields: [logServiceJob.serviceJobId],
		references: [serviceJob.id]
	})
}));

export const meterReadingRelations = relations(meterReading, ({ one }) => ({
	equipment: one(equipment, { fields: [meterReading.equipmentId], references: [equipment.id] }),
	log: one(maintenanceLog, { fields: [meterReading.logId], references: [maintenanceLog.id] })
}));

export const photoRelations = relations(photo, ({ one }) => ({
	equipment: one(equipment, { fields: [photo.equipmentId], references: [equipment.id] }),
	log: one(maintenanceLog, { fields: [photo.logId], references: [maintenanceLog.id] })
}));
