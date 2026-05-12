import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, paginateAll } from '../lib/pennylane-client.js';

// Patch global fetch to mock Pennylane responses without hitting the network.
function mockFetch(pages) {
  const calls = [];
  let i = 0;
  globalThis.fetch = async (url) => {
    calls.push(url);
    const page = pages[i++];
    if (!page) throw new Error(`Mock exhausted at call ${i}: no more pages`);
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => page,
      text: async () => JSON.stringify(page),
    };
  };
  return { calls };
}

test('paginate yields all items across pages and stops on has_more=false', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  mockFetch([
    { items: [{ id: 1 }, { id: 2 }], has_more: true, next_cursor: 'c1' },
    { items: [{ id: 3 }, { id: 4 }], has_more: true, next_cursor: 'c2' },
    { items: [{ id: 5 }], has_more: false },
  ]);
  const out = await paginateAll('/customer_invoices');
  assert.deepEqual(out.map((x) => x.id), [1, 2, 3, 4, 5]);
});

test('paginate forwards cursor in URL', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const { calls } = mockFetch([
    { items: [{ id: 1 }], has_more: true, next_cursor: 'abc=xyz' },
    { items: [{ id: 2 }], has_more: false },
  ]);
  await paginateAll('/journals');
  assert.match(calls[0], /\/journals\?limit=100$/);
  assert.match(calls[1], /\/journals\?limit=100&cursor=abc%3Dxyz$/);
});

test('paginate appends limit with `&` when path already has query', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const { calls } = mockFetch([{ items: [], has_more: false }]);
  await paginateAll('/ledger_entries?period_start=2026-04-01');
  assert.match(calls[0], /\/ledger_entries\?period_start=2026-04-01&limit=100$/);
});

test('paginate throws when maxPages reached without has_more=false', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  mockFetch([
    { items: [{ id: 1 }], has_more: true, next_cursor: 'c' },
    { items: [{ id: 2 }], has_more: true, next_cursor: 'c' },
    { items: [{ id: 3 }], has_more: true, next_cursor: 'c' },
  ]);
  await assert.rejects(
    paginateAll('/customer_invoices', { maxPages: 2 }),
    /maxPages=2/,
  );
});

test('paginate honors custom limit', async () => {
  process.env.PENNYLANE_TOKEN = 'mock';
  const { calls } = mockFetch([{ items: [], has_more: false }]);
  await paginateAll('/journals', { limit: 25 });
  assert.match(calls[0], /limit=25/);
});
