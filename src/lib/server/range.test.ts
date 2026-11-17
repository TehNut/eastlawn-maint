import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRange } from './range.ts';
import { ftsQuery } from '../manual-text.ts';

test('parseRange', () => {
	assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
	assert.deepEqual(parseRange('bytes=900-', 1000), { start: 900, end: 999 });
	assert.deepEqual(parseRange('bytes=-100', 1000), { start: 900, end: 999 });
	assert.deepEqual(parseRange('bytes=990-2000', 1000), { start: 990, end: 999 });
	assert.equal(parseRange('bytes=1000-', 1000), null);
	assert.equal(parseRange('bytes=5-1', 1000), null);
	assert.equal(parseRange('bytes=0-1,5-9', 1000), null);
	assert.equal(parseRange('bytes=-', 1000), null);
});

test('ftsQuery adds plural and singular forms', () => {
	assert.equal(
		ftsQuery('m1', 'How do I replace the filters?'),
		'manual_id:"m1" AND text:("replace" OR "replaces" OR "filters" OR "filter")'
	);
	assert.equal(ftsQuery('m1', 'the and'), null);
});
