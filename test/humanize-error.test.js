import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeError } from '../lib/pennylane-client.js';

const URL = 'https://app.pennylane.com/api/external/v2/me';

test('400 → bad request message', () => {
  const msg = humanizeError(400, 'invalid query', URL);
  assert.match(msg, /HTTP 400/);
  assert.match(msg, /mal formée/);
});

test('401 → token guidance', () => {
  const msg = humanizeError(401, 'unauthorized', URL);
  assert.match(msg, /HTTP 401/);
  assert.match(msg, /Token invalide ou expiré/);
});

test('403 → scopes guidance', () => {
  const msg = humanizeError(403, 'forbidden', URL);
  assert.match(msg, /HTTP 403/);
  assert.match(msg, /scopes/);
});

test('404 → resource missing guidance', () => {
  const msg = humanizeError(404, 'not found', URL);
  assert.match(msg, /HTTP 404/);
  assert.match(msg, /Ressource introuvable/);
});

test('422 → validation guidance with details', () => {
  const msg = humanizeError(422, '{"field":"period_end","error":"required"}', URL);
  assert.match(msg, /HTTP 422/);
  assert.match(msg, /period_end/);
});

test('500 → "Pennylane temporairement indisponible"', () => {
  const msg = humanizeError(500, 'server error', URL);
  assert.match(msg, /temporairement indisponible/);
});

test('502, 503, 504 → 5xx branch', () => {
  for (const status of [502, 503, 504]) {
    const msg = humanizeError(status, 'gateway', URL);
    assert.match(msg, /temporairement indisponible/);
    assert.match(msg, new RegExp(`HTTP ${status}`));
  }
});

test('unknown status → generic fallback with URL + text', () => {
  const msg = humanizeError(418, 'I am a teapot', URL);
  assert.match(msg, /HTTP 418/);
  assert.match(msg, /I am a teapot/);
});
