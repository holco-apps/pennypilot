import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSetupDiagnostics, runSetupDiagnostics } from '../lib/setup-diagnostics.js';

test('runSetupDiagnostics blocks when credentials are missing', async () => {
  const diag = await runSetupDiagnostics({ env: {} });

  assert.equal(diag.status, 'blocked');
  assert.equal(diag.holco.ok, false);
  assert.equal(diag.pennylane.ok, false);
  assert.match(diag.issues.join('\n'), /clé HOLCO/i);
  assert.match(diag.issues.join('\n'), /token Pennylane/i);
});

test('runSetupDiagnostics detects valid env and company without exposing secrets', async () => {
  const diag = await runSetupDiagnostics({
    env: {
      HOLCO_LICENSE_KEY: 'HOLCO-ABCD-1234-EFGH-5678',
      PENNYLANE_TOKEN: 'secret-token',
    },
    assertLicense: async () => {},
    getMe: async () => ({
      company: { name: 'Cabinet Demo', reg_no: '123456789' },
      scopes: ['ledger_entries:readonly', 'customer_invoices:readonly'],
    }),
  });

  assert.equal(diag.status, 'ok');
  assert.equal(diag.company, 'Cabinet Demo (123456789)');
  assert.deepEqual(diag.scopes, ['ledger_entries:readonly', 'customer_invoices:readonly']);

  const out = formatSetupDiagnostics(diag);
  assert.match(out, /Cabinet Demo/);
  assert.doesNotMatch(out, /secret-token/);
  assert.doesNotMatch(out, /HOLCO-ABCD/);
});

test('runSetupDiagnostics warns when scopes are not reported by /me', async () => {
  const diag = await runSetupDiagnostics({
    env: {
      HOLCO_LICENSE_KEY: 'HOLCO-ABCD-1234-EFGH-5678',
      PENNYLANE_TOKEN: 'secret-token',
    },
    assertLicense: async () => {},
    getMe: async () => ({ company: { name: 'Demo' } }),
  });

  assert.equal(diag.status, 'warning');
  assert.equal(diag.scopeStatus, 'unknown');
  assert.match(formatSetupDiagnostics(diag), /Scopes : non exposés/);
});
