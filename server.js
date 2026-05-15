// PennyPilot — MCP server (HOLCO)
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

import { VERSION } from './lib/version.js';
import { log } from './lib/logger.js';
import { assertHolcoLicense } from './lib/holco-license.js';
import { aboutPennypilot, aboutPennypilotSchema } from './lib/tools/about-pennypilot.js';
import { startPennypilot, startPennypilotSchema } from './lib/tools/start-pennypilot.js';
import { diagnosePennypilotSetup, diagnosePennypilotSetupSchema } from './lib/tools/diagnose-pennypilot-setup.js';
import { explainPennypilotFlow, explainPennypilotFlowSchema } from './lib/tools/explain-pennypilot-flow.js';
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
import { sendFeedback, sendFeedbackSchema } from './lib/tools/send-feedback.js';

const TOOLS = [
  aboutPennypilotSchema,
  startPennypilotSchema,
  diagnosePennypilotSetupSchema,
  explainPennypilotFlowSchema,
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
  sendFeedbackSchema,
];

const HANDLERS = {
  about_pennypilot: aboutPennypilot,
  start_pennypilot: startPennypilot,
  diagnose_pennypilot_setup: diagnosePennypilotSetup,
  explain_pennypilot_flow: explainPennypilotFlow,
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
  send_feedback_to_holco: sendFeedback,
};

const SETUP_TOOL_NAMES = new Set([
  'about_pennypilot',
  'start_pennypilot',
  'diagnose_pennypilot_setup',
  'explain_pennypilot_flow',
]);

const server = new Server(
  { name: 'pennypilot', version: VERSION },
  { capabilities: { tools: {} } }
);

function setupGuidance(err) {
  const msg = err?.message || '';
  if (
    msg.includes('PENNYLANE_TOKEN absent') ||
    msg.includes('Pennylane HTTP 401') ||
    msg.includes('Pennylane HTTP 403') ||
    msg.includes('HOLCO_LICENSE_KEY') ||
    msg.includes('Clé HOLCO')
  ) {
    return `# PennyPilot doit vérifier l'installation

${msg}

Lancez : **« PennyPilot, vérifie mon installation »**.

Ce diagnostic contrôle la clé HOLCO, le token Pennylane et l'accès au dossier sans afficher aucun secret.`;
  }
  return null;
}

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
    if (!SETUP_TOOL_NAMES.has(name)) {
      await assertHolcoLicense();
    }
    const result = await handler(args || {});
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const guidance = setupGuidance(err);
    return {
      content: [
        { type: 'text', text: guidance || `Erreur lors de l'exécution de ${name} : ${err.message}` },
      ],
      isError: true,
    };
  }
});

// Vérification de la clé HOLCO au démarrage, mais sans empêcher les outils
// d'aide (`diagnose_pennypilot_setup`, `start_pennypilot`) de s'afficher.
// Les outils métier re-valident la licence juste avant exécution.
try {
  await assertHolcoLicense();
  log.info('license.ok');
} catch (err) {
  log.warn('license.startup_check_failed', { err: err.message });
}

const transport = new StdioServerTransport();
await server.connect(transport);
log.info('server.started', { transport: 'stdio' });
