import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEvent, emptyReply, EQUIPMENT_HREF, finishReply, linkedEquipment } from './chat.ts';

test('applyEvent builds the reply the browser shows and the server saves', () => {
	const reply = emptyReply();
	applyEvent(reply, { chat: 'c1' });
	applyEvent(reply, { reasoning: 'Check ' });
	applyEvent(reply, { reasoning: 'the manual.' });
	applyEvent(reply, { tool: { id: 't1', label: 'Searching…', args: { query: 'oil' } } });
	applyEvent(reply, { tool: { id: 't2', label: 'Searching…', args: { query: 'filter' } } });
	applyEvent(reply, { toolDone: { id: 't1', output: 'page 12' } });
	applyEvent(reply, { reasoning: 'Found it.' });
	applyEvent(reply, { text: 'Every 250 h ' });
	applyEvent(reply, { text: '(p. 12).' });
	finishReply(reply);

	assert.equal(reply.content, 'Every 250 h (p. 12).');
	assert.deepEqual(
		reply.parts.map((p) => (p.type === 'tool' ? `${p.id}:${p.state}` : p.text)),
		['Check the manual.', 't1:done', 't2:error', 'Found it.']
	);
});

test('equipment links the model writes are found, and nothing else', () => {
	const reply =
		'Check [Kubota L3901](/equipment/a1b2c3d4e5f6a7b8) and [the mower](/equipment/fx-02). ' +
		'See [docs](/manuals/m1) or [elsewhere](https://x.test/equipment/zz).';
	assert.deepEqual(linkedEquipment(reply), ['a1b2c3d4e5f6a7b8', 'fx-02']);
	assert.equal('/equipment/fx-02'.match(EQUIPMENT_HREF)?.[1], 'fx-02');
	assert.equal('/equipment/fx-02/edit'.match(EQUIPMENT_HREF), null);
});
