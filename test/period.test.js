import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePeriod, defaultPeriod } from '../lib/period.js';

test('parsePeriod month: 2026-04', () => {
  const p = parsePeriod('2026-04');
  assert.equal(p.label, '2026-04');
  assert.equal(p.start, '2026-04-01');
  assert.equal(p.end, '2026-04-30');
  assert.equal(p.prevLabel, '2026-03');
  assert.equal(p.prevStart, '2026-03-01');
  assert.equal(p.prevEnd, '2026-03-31');
});

test('parsePeriod month boundary: January rolls year back', () => {
  const p = parsePeriod('2026-01');
  assert.equal(p.prevStart, '2025-12-01');
  assert.equal(p.prevEnd, '2025-12-31');
});

test('parsePeriod leap year: 2024-02 ends on 29', () => {
  const p = parsePeriod('2024-02');
  assert.equal(p.end, '2024-02-29');
});

test('parsePeriod quarter: 2026-Q2', () => {
  const p = parsePeriod('2026-Q2');
  assert.equal(p.label, 'T2 2026');
  assert.equal(p.start, '2026-04-01');
  assert.equal(p.end, '2026-06-30');
  assert.equal(p.prevLabel, 'T1 2026');
});

test('parsePeriod quarter Q1 → previous Q4 of previous year', () => {
  const p = parsePeriod('2026-Q1');
  assert.equal(p.prevLabel, 'T4 2025');
  assert.equal(p.prevStart, '2025-10-01');
  assert.equal(p.prevEnd, '2025-12-31');
});

test('parsePeriod year: 2026', () => {
  const p = parsePeriod('2026');
  assert.equal(p.label, 'Année 2026');
  assert.equal(p.start, '2026-01-01');
  assert.equal(p.end, '2026-12-31');
});

test('parsePeriod rejects bogus input', () => {
  assert.throws(() => parsePeriod('not-a-period'), /Format de période invalide/);
});

test('parsePeriod rejects month 13', () => {
  assert.throws(() => parsePeriod('2026-13'), /Mois invalide/);
});

test('parsePeriod accepts lowercase q', () => {
  const p = parsePeriod('2026-q3');
  assert.equal(p.label, 'T3 2026');
});

test('defaultPeriod returns "YYYY-MM" format', () => {
  const d = defaultPeriod();
  assert.match(d, /^\d{4}-\d{2}$/);
});
