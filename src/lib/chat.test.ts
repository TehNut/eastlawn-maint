import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEvent, emptyReply, finishReply } from './chat.ts';

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
