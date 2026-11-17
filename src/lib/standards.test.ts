import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crossSpec, offStandard, standardsFor, type Standard } from './standards.ts';

// The seeded standards, as in the migration.
const seed: Standard[] = [
	{
		product: 'Diesel engine oil',
		matches: 'engine oil',
		brand: 'Shell Rotella T5',
		crossFormat: false,
		notes: null
	},
	{
		product: 'Gasoline engine oil',
		matches: 'engine oil',
		brand: 'Valvoline',
		crossFormat: false,
		notes: null
	},
	{ product: 'Filters', matches: 'filter', brand: 'NAPA', crossFormat: true, notes: null }
];

test('items match by keyword', () => {
	assert.deepEqual(
		standardsFor('Engine oil', seed).map((s) => s.brand),
		['Shell Rotella T5', 'Valvoline']
	);
	assert.deepEqual(
		standardsFor('Hydraulic oil filter', seed).map((s) => s.brand),
		['NAPA']
	);
	assert.equal(standardsFor('Coolant', seed).length, 0);
	assert.equal(standardsFor('Hydraulic oil', seed).length, 0);
});

test('a spec naming another brand is off standard; blank or matching specs are fine', () => {
	const oil = standardsFor('Engine oil', seed);
	assert.equal(offStandard('Shell Rotella T5 15W-40', oil), false);
	assert.equal(offStandard('Valvoline SAE 10W-40', oil), false);
	assert.equal(offStandard('John Deere Plus-50 II', oil), true);
	assert.equal(offStandard('', oil), false);
	assert.equal(offStandard('Anything', []), false);
});

test('the three NAPA spec forms from the skill', () => {
	assert.equal(
		crossSpec('NAPA', '7750S', 'John Deere RE504836'),
		'NAPA 7750S, crosses to John Deere RE504836'
	);
	assert.equal(
		crossSpec('NAPA', '', 'John Deere AM125424'),
		'NAPA, crosses to John Deere AM125424'
	);
	assert.equal(crossSpec('NAPA', ' ', ''), 'NAPA');
});
