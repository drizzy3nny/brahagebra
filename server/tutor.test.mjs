import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './tutor.mjs';

async function withServer(options, fn) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await fn(base); } finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (base, data, origin = base) => fetch(base + '/api/tutor', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) });

test('missing configuration exposes no key and makes no upstream request', async () => {
  await withServer({ key: '', model: '', fetchImpl: () => assert.fail('Unexpected network call') }, async base => {
    assert.deepEqual(await (await fetch(base + '/api/tutor/status')).json(), { available: false });
    assert.equal((await post(base, { question: 'Why?', context: 'x=2' })).status, 503);
  });
});
test('rejects cross-origin and invalid requests before using the API', async () => {
  await withServer({ key: 'test', model: 'test', fetchImpl: () => assert.fail('Unexpected network call') }, async base => {
    assert.equal((await post(base, { question: 'Why?', context: 'x=2' }, 'https://other.example')).status, 403);
    assert.equal((await post(base, { question: 'a'.repeat(1001), context: 'x=2' })).status, 400);
  });
});
test('returns generated text and sends limited, non-stored context to the model', async () => {
  await withServer({ key: 'test', model: 'configured-model', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.model, 'configured-model');
    assert.equal(body.max_output_tokens, 1000);
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Divide both sides by two.' }] }] }));
  } }, async base => {
    const response = await post(base, { question: 'Why?', context: '2x=4' });
    assert.equal(response.status, 200); assert.equal((await response.json()).text, 'Divide both sides by two.');
  });
});
test('upstream errors do not leak provider messages or credentials', async () => {
  await withServer({ key: 'secret-test', model: 'test', fetchImpl: async () => new Response('sensitive upstream detail', { status: 401 }) }, async base => {
    const response = await post(base, { question: 'Why?', context: '2x=4' });
    assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /sensitive|secret-test/);
  });
});
test('rate limits repeated requests', async () => {
  await withServer({ key: 'test', model: 'test', fetchImpl: async () => new Response('', { status: 429 }) }, async base => {
    for (let i = 0; i < 10; i++) await post(base, { question: 'Why?', context: 'x=2' });
    const response = await post(base, { question: 'Why?', context: 'x=2' });
    assert.equal(response.status, 429); assert.match((await response.json()).error, /minute/);
  });
});
