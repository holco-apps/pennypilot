// PennyPilot — MCP server v0.2.3 (by HOLCO)
// Le copilote IA pour cabinets Pennylane.
// Transport stdio (Claude Desktop). Adapter HTTP Mistral en v0.3.
//
// Architecture 3 couches stricte :
//   server.js               → routage MCP (ce fichier)
//   lib/tools/*.js          → schemas + handlers (un fichier par tool)
//   lib/playbooks/*.js      → logique composite (chaîne plusieurs endpoints)
//   lib/pennylane-client.js → couche HTTP (auth, retry, timeout, header 2026)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { assertHolcoLicense } from './lib/holco-license.js';
import { aboutPennypilot, aboutPennypilotSchema } from './lib/tools/about-pennypilot.js';
import { findUnpaidInvoices, findUnpaidInvoicesSchema } from './lib/tools/find-unpaid-invoices.js';
import { getCompanyPnl, getCompanyPnlSchema } from './lib/tools/get-company-pnl.js';
import { generateMonthlyClose, generateMonthlyCloseSchema } from './lib/tools/generate-monthly-close.js';
import { listJournals, listJournalsSchema } from './lib/tools/list-journals.js';
import { getChartOfAccounts, getChartOfAccountsSchema } from './lib/tools/get-chart-of-accounts.js';
import { browseAccountLedger, browseAccountLedgerSchema } from './lib/tools/browse-account-ledger.js';
import { findUnletteredEntries, findUnletteredEntriesSchema } from './lib/tools/find-unlettered-entries.js';
import { browseJournalEntries, browseJournalEntriesSchema } from './lib/tools/browse-journal-entries.js';
import { getJournalEntryDetail, getJournalEntryDetailSchema } from './lib/tools/get-journal-entry-detail.js';
import { auditRecentChanges, auditRecentChangesSchema } from './lib/tools/audit-recent-changes.js';
import { listFiscalYears, listFiscalYearsSchema } from './lib/tools/list-fiscal-years.js';

const TOOLS = [
  aboutPennypilotSchema,
  findUnpaidInvoicesSchema,
  getCompanyPnlSchema,
  generateMonthlyCloseSchema,
  listJournalsSchema,
  getChartOfAccountsSchema,
  browseAccountLedgerSchema,
  findUnletteredEntriesSchema,
  browseJournalEntriesSchema,
  getJournalEntryDetailSchema,
  auditRecentChangesSchema,
  listFiscalYearsSchema,
];

const HANDLERS = {
  about_pennypilot: aboutPennypilot,
  find_unpaid_customer_invoices: findUnpaidInvoices,
  get_company_pnl: getCompanyPnl,
  generate_monthly_close_report: generateMonthlyClose,
  list_journals: listJournals,
  get_chart_of_accounts: getChartOfAccounts,
  browse_account_ledger: browseAccountLedger,
  find_unlettered_entries: findUnletteredEntries,
  browse_journal_entries: browseJournalEntries,
  get_journal_entry_detail: getJournalEntryDetail,
  audit_recent_changes: auditRecentChanges,
  list_fiscal_years: listFiscalYears,
};

const server = new Server(
  { name: 'pennypilot', version: '0.2.3' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      content: [{ type: 'text', text: `Outil inconnu : ${name}` }],
      isError: true,
    };
  }
  try {
    const result = await handler(args || {});
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [
        { type: 'text', text: `Erreur lors de l'exécution de ${name} : ${err.message}` },
      ],
      isError: true,
    };
  }
});

// Vérification de la clé HOLCO AVANT démarrage stdio.
// Si invalide / absente / HOLCO server down sans cache : refus de démarrer.
try {
  await assertHolcoLicense();
  console.error('[PennyPilot] Clé HOLCO validée.');
} catch (err) {
  console.error(`[PennyPilot] ❌ ${err.message}`);
  process.exit(1);
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[PennyPilot] v0.2.3 by HOLCO — démarré sur stdio.');
