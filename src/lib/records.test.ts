// The fixtures are the cemetery-maintenance skill's examples.md records, as parsed YAML.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planImport, recordsRoot } from './records.ts';

const cat420 = {
	id: 'cat-420',
	name: 'Cat 420 backhoe',
	category: 'vehicle',
	kind: 'backhoe',
	make: 'Caterpillar',
	model: 420,
	year: 2016,
	serial: 'CAT0420EJAZ12345',
	location: 'Equipment shed',
	status: 'in-service',
	meter: { unit: 'hours', reading: 2410, read_on: '2026-08-01' },
	service: [
		{
			id: 'engine-oil',
			name: 'Engine oil and filter',
			interval: { meter: { every: 250, unit: 'hours' }, calendar: { every: 12, unit: 'months' } },
			consumables: [
				{ item: 'Engine oil', spec: '15W-40 diesel, API CK-4', qty: '10 qt' },
				{ item: 'Oil filter', spec: '1R-1808', qty: 1 }
			]
		},
		{ id: 'fuel-filters', name: 'Fuel filters', interval: { meter: { every: 500, unit: 'hours' } } }
	],
	manual: 'maintenance/records/manuals/cat-420.md',
	notes: 'Primary user: Ron\nKeep the bucket down overnight.'
};

const shopWell = {
	id: 'shop-well',
	name: 'Shop well and pressure pump',
	category: 'machinery',
	kind: 'well-pump',
	location: 'North of the shop',
	status: 'in-service',
	meter: { unit: 'none' },
	service: [
		{
			id: 'sediment-filter',
			name: 'Sediment filter',
			interval: { calendar: { every: 3, unit: 'months' } }
		}
	],
	notes: 'In-ground well.'
};

const oilLog = {
	id: '2026-03-12-cat-420-engine-oil',
	equipment_id: 'cat-420',
	date: '2026-03-12',
	kind: 'scheduled',
	summary: 'Engine oil and filter',
	meter_reading: 2200,
	performed_by: 'Nick',
	work_done: 'Drained engine oil, replaced the oil filter, refilled 10 qt.\n',
	parts_used: [{ item: 'Oil filter', spec: '1R-1808', qty: 1 }],
	service_ids: ['engine-oil'],
	photos: [{ file: 'drained.jpg', caption: 'Oil drained' }, { file: 'missing.jpg' }]
};

const files = new Set(['manuals/cat-420.pdf', 'logs/2026-03-12-cat-420-engine-oil/drained.jpg']);

const entries = [
	{ path: 'equipment/cat-420.yaml', data: cat420 },
	{ path: 'equipment/shop-well.yaml', data: shopWell },
	{ path: 'logs/2026-03-12-cat-420-engine-oil.yaml', data: oilLog }
];

describe('planImport', () => {
	const plan = planImport(entries, files);
	const cat = plan.equipment.find((e) => e.key === 'cat-420')!;

	test('maps equipment fields as the spec lists', () => {
		assert.equal(cat.status, 'active');
		assert.equal(cat.manufacturer, 'Caterpillar');
		assert.equal(cat.model, '420');
		assert.equal(cat.serialNumber, 'CAT0420EJAZ12345');
		assert.equal(cat.place, 'Equipment shed');
		assert.equal(cat.kind, 'backhoe');
		assert.equal(cat.year, 2016);
		assert.deepEqual(cat.reading, { value: 2410, readOn: '2026-08-01' });
		assert.equal(cat.manualPdf, 'manuals/cat-420.pdf');
	});

	test('moves "Primary user" out of notes into the operator', () => {
		assert.equal(cat.operatorName, 'Ron');
		assert.equal(cat.notes, 'Keep the bucket down overnight.');
	});

	test('keeps service ids as slugs and numbers as text', () => {
		assert.deepEqual(
			cat.jobs.map((j) => [j.slug, j.meterEvery, j.calendarEvery, j.calendarUnit]),
			[
				['engine-oil', 250, 12, 'months'],
				['fuel-filters', 500, null, null]
			]
		);
		assert.equal(cat.jobs[0].consumables[1].qty, '1');
	});

	test('a no-meter item imports with calendar jobs', () => {
		const well = plan.equipment.find((e) => e.key === 'shop-well')!;
		assert.equal(well.meterUnit, null);
		assert.equal(well.category, 'machinery');
	});

	test('maps the log, keeping found pictures and warning about missing ones', () => {
		assert.equal(plan.logs.length, 1);
		const log = plan.logs[0];
		assert.equal(log.type, 'service');
		assert.equal(log.description, 'Drained engine oil, replaced the oil filter, refilled 10 qt.');
		assert.deepEqual(log.serviceSlugs, ['engine-oil']);
		assert.equal(log.partsUsed[0].qty, '1');
		assert.deepEqual(log.photos, [
			{ path: 'logs/2026-03-12-cat-420-engine-oil/drained.jpg', caption: 'Oil drained' }
		]);
		assert.deepEqual(
			plan.problems.map((p) => p.severity),
			['warning']
		);
	});
});

describe('the skill validation rules', () => {
	const only = (data: object, path: string, extra: { path: string; data: unknown }[] = []) =>
		planImport([{ path, data }, ...extra], new Set());

	test('id must match the filename', () => {
		const plan = only(shopWell, 'equipment/well.yaml');
		assert.equal(plan.equipment.length, 0);
		assert.match(plan.problems[0].message, /doesn't match the filename/);
	});

	test('ids are kebab-case', () => {
		const plan = only({ ...shopWell, id: 'Shop_Well' }, 'equipment/Shop_Well.yaml');
		assert.match(plan.problems[0].message, /kebab-case/);
	});

	test('meter intervals must match meter.unit', () => {
		const bad = {
			...shopWell,
			service: [{ id: 'x', name: 'X', interval: { meter: { every: 10, unit: 'hours' } } }]
		};
		const plan = only(bad, 'equipment/shop-well.yaml');
		assert.equal(plan.equipment.length, 0);
		assert.match(plan.problems[0].message, /must match meter.unit/);
	});

	test('every service needs an interval', () => {
		const bad = { ...shopWell, service: [{ id: 'x', name: 'X' }] };
		assert.match(only(bad, 'equipment/shop-well.yaml').problems[0].message, /no interval/);
	});

	test('a log needs an existing equipment file', () => {
		const plan = only(oilLog, 'logs/2026-03-12-cat-420-engine-oil.yaml');
		assert.equal(plan.logs.length, 0);
		assert.match(plan.problems[0].message, /no valid equipment file/);
	});

	test('service_ids must be services on that item', () => {
		const plan = planImport(
			[
				{ path: 'equipment/cat-420.yaml', data: cat420 },
				{
					path: 'logs/2026-03-12-cat-420-engine-oil.yaml',
					data: { ...oilLog, photos: [], service_ids: ['coolant'] }
				}
			],
			new Set(['manuals/cat-420.pdf'])
		);
		assert.equal(plan.logs.length, 0);
		assert.match(plan.problems[0].message, /coolant aren't services/);
	});

	test('a missing manual PDF is a warning, not an error', () => {
		const plan = planImport([{ path: 'equipment/cat-420.yaml', data: cat420 }], new Set());
		assert.equal(plan.equipment.length, 1);
		assert.equal(plan.equipment[0].manualPdf, null);
		assert.equal(plan.problems[0].severity, 'warning');
	});
});

test('recordsRoot finds the records folder at any depth', () => {
	assert.equal(recordsRoot(['records/equipment/a.yaml', 'records/notes.md']), 'records/');
	assert.equal(recordsRoot(['maintenance/records/equipment/a.yaml']), 'maintenance/records/');
	assert.equal(recordsRoot(['notes.md']), null);
});
