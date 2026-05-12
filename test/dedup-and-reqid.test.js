import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pnlFetch, humanizeError } from '../lib/pennylane-client.js';

function setupFetchMock({ status = 200, body = { ok: true }, headersObj = {}, delayMs = 0 } = {}) {
  let callCount = 0;
  const seenHeaders = [];
  globalThis.fetch = async (url, init) => {
    callCount++;
    seenHeaders.push(init.headers);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name) => headersObj[name.toLowerCase()] ?? null,
      },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { calls: () => callCount, headers: () => seenHeaders };
}

test('in-flight dedup: 3 parallel GETs to the same URL → 1 HTTP call', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const m = setupFetchMock({ body: { ok: true, items: [{ id: 1 }] }, delayMs: 20 });
  const [a, b, c] = await Promise.all([pnlFetch('/me'), pnlFetch('/me'), pnlFetch('/me')]);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.equal(m.calls(), 1, 'expected single network call for 3 parallel /me');
});

test('dedup released after settling: sequential GETs trigger new calls', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const m = setupFetchMock({ body: { ok: true } });
  await pnlFetch('/me');
  await pnlFetch('/me');
  await pnlFetch('/me');
  assert.equal(m.calls(), 3, 'sequential calls must not dedup (in-flight map already cleared)');
});

test('different URLs are NOT deduped', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const m = setupFetchMock({ body: { ok: true }, delayMs: 10 });
  await Promise.all([pnlFetch('/me'), pnlFetch('/journals'), pnlFetch('/customers')]);
  assert.equal(m.calls(), 3);
});

test('POST is not deduped (writes are independent)', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const m = setupFetchMock({ body: { ok: true }, delayMs: 10 });
  await Promise.all([
    pnlFetch('/customer_invoices', { method: 'POST', body: '{}' }),
    pnlFetch('/customer_invoices', { method: 'POST', body: '{}' }),
  ]);
  assert.equal(m.calls(), 2);
});

test('client X-Request-Id is sent on every call, format pp-<hex>', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const m = setupFetchMock({ body: { ok: true } });
  await pnlFetch('/journals');
  const sent = m.headers()[0]['X-Request-Id'];
  assert.match(sent, /^pp-[0-9a-f]{12}$/);
});

test('humanizeError without ids stays clean (no trace footer)', () => {
  const msg = humanizeError(404, 'not found', '/me');
  assert.match(msg, /HTTP 404/);
  assert.doesNotMatch(msg, /Identifiants de trace/);
});

test('humanizeError with serverReqId emits client + server trace footer', () => {
  const msg = humanizeError(401, 'unauthorized', '/me', {
    clientReqId: 'pp-abc123def456',
    serverReqId: 'srv-xyz',
  });
  assert.match(msg, /client=pp-abc123def456/);
  assert.match(msg, /serveur=srv-xyz/);
});

test('humanizeError with only clientReqId says server did not return one', () => {
  const msg = humanizeError(500, 'oops', '/me', { clientReqId: 'pp-only' });
  assert.match(msg, /pp-only/);
  assert.match(msg, /serveur Pennylane n'a pas renvoyé/);
});

test('error message includes trace for upstream HTTP failures', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  setupFetchMock({ status: 422, body: { error: 'bad' }, headersObj: { 'x-request-id': 'srv-422' } });
  await assert.rejects(pnlFetch('/me'), /srv-422/);
});
