import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FluentAsync } from '../lib/pennylane-client.js';

async function* range(n) {
  for (let i = 0; i < n; i++) yield i;
}

function counted(n) {
  const state = { yielded: 0 };
  const iter = (async function* () {
    for (let i = 0; i < n; i++) {
      state.yielded++;
      yield i;
    }
  })();
  return { iter: new FluentAsync(iter), state };
}

test('toArray collects all items', async () => {
  const out = await new FluentAsync(range(5)).toArray();
  assert.deepEqual(out, [0, 1, 2, 3, 4]);
});

test('filter keeps only matching items', async () => {
  const out = await new FluentAsync(range(10)).filter((x) => x % 2 === 0).toArray();
  assert.deepEqual(out, [0, 2, 4, 6, 8]);
});

test('map transforms each item', async () => {
  const out = await new FluentAsync(range(4)).map((x) => x * x).toArray();
  assert.deepEqual(out, [0, 1, 4, 9]);
});

test('take limits the number of items', async () => {
  const out = await new FluentAsync(range(100)).take(3).toArray();
  assert.deepEqual(out, [0, 1, 2]);
});

test('take is LAZY — source not fully consumed past the limit', async () => {
  const { iter, state } = counted(1_000_000);
  const out = await iter.take(5).toArray();
  assert.deepEqual(out, [0, 1, 2, 3, 4]);
  // 5 items pulled, maybe up to a few extra if buffering; here we expect exactly 5.
  assert.equal(state.yielded, 5);
});

test('filter is lazy — short-circuits with take', async () => {
  const { iter, state } = counted(1_000_000);
  const out = await iter
    .filter((x) => x % 100 === 0)
    .take(3)
    .toArray();
  assert.deepEqual(out, [0, 100, 200]);
  // We had to scan 201 items to find 3 multiples of 100 (0, 100, 200 — 200 ends the take).
  assert.equal(state.yielded, 201);
});

test('chain order matters: take(5).filter(odd) vs filter(odd).take(5)', async () => {
  const a = await new FluentAsync(range(20)).take(5).filter((x) => x % 2 === 1).toArray();
  // Take 5 first: [0,1,2,3,4] → filter odd → [1,3]
  assert.deepEqual(a, [1, 3]);

  const b = await new FluentAsync(range(20)).filter((x) => x % 2 === 1).take(5).toArray();
  // Filter odd then take 5 → [1,3,5,7,9]
  assert.deepEqual(b, [1, 3, 5, 7, 9]);
});

test('reduce accumulates', async () => {
  const sum = await new FluentAsync(range(11)).reduce((a, b) => a + b, 0);
  assert.equal(sum, 55);
});

test('first returns the first item or undefined', async () => {
  assert.equal(await new FluentAsync(range(3)).first(), 0);
  assert.equal(await new FluentAsync(range(0)).first(), undefined);
});

test('count counts the items', async () => {
  assert.equal(await new FluentAsync(range(7)).count(), 7);
});

test('FluentAsync is itself async-iterable', async () => {
  const f = new FluentAsync(range(3));
  const out = [];
  for await (const x of f) out.push(x);
  assert.deepEqual(out, [0, 1, 2]);
});
