import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nafHint } from '../lib/context-guard.js';

test('nafHint matches 2-digit class (47 → retail)', () => {
  const hint = nafHint('47.71Z');
  assert.match(hint, /Commerce de détail/);
});

test('nafHint matches 4-digit prefix (70.22Z → conseil affaires)', () => {
  const hint = nafHint('70.22Z');
  assert.match(hint, /Conseil pour les affaires/);
});

test('nafHint falls back to 2-digit when 4-digit not mapped', () => {
  // 47.99 not explicitly mapped → 47 retail is the fallback
  const hint = nafHint('47.99B');
  assert.match(hint, /Commerce de détail/);
});

test('nafHint returns null for unknown NAF', () => {
  assert.equal(nafHint('99.99Z'), null);
});

test('nafHint returns null for empty/null input', () => {
  assert.equal(nafHint(null), null);
  assert.equal(nafHint(''), null);
  assert.equal(nafHint(undefined), null);
});

test('nafHint strips non-digit chars (52A → no match expected)', () => {
  // "52A" → cleans to "52" → no mapping → null
  assert.equal(nafHint('52A'), null);
});
