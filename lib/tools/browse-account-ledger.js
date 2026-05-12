// Tool : browse_account_ledger
// La vue "Grand livre par compte" : toutes les écritures d'un compte sur une période,
// avec libellé, journal, débit, crédit, et solde courant cumulé.
// Endpoint : GET /ledger_entry_lines avec filtre ledger_account_id + période.
// Scope 2026 : ledger_entries:readonly + ledger_accounts:readonly.

import { pnlFetch, paginateAll } from '../pennylane-client.js';

export const browseAccountLedgerSchema = {
  name: 'browse_account_ledger',
  description: `Affiche le **Grand livre d'un compte** sur une période donnée : toutes les écritures du compte avec date, libellé, journal d'origine, débit, crédit et solde courant cumulé. C'est l'équivalent de la vue "Grand livre" dans l'interface Pennylane (ou de la consultation d'un compte dans le PCG).

À utiliser quand l'utilisateur demande :
- "Écritures du compte 411 sur janvier 2026"
- "Grand livre du compte 401 ABCDE sur Q1"
- "Détails du compte 512000 le mois dernier"
- "Toutes les écritures du compte X entre X et Y"
- "Mouvement du compte de banque"

Paramètres :
- \`account_number\` (requis) : le numéro de compte exact ou un préfixe sans wildcard (ex : "411", "401000", "512100"). Si plusieurs comptes matchent, on renvoie une erreur explicite.
- \`period_start\` (requis) : début période au format ISO date (YYYY-MM-DD).
- \`period_end\` (requis) : fin période au format ISO date (YYYY-MM-DD).

Ne PAS utiliser pour :
- Le plan comptable (utiliser get_chart_of_accounts)
- La balance d'un compte sur plusieurs périodes (utiliser get_company_pnl ou trial_balance — disponible v0.3)`,
  inputSchema: {
    type: 'object',
    properties: {
      account_number: {
        type: 'string',
        description: "Numéro de compte exact ou préfixe (ex : '411', '401000', '512100').",
      },
      period_start: { type: 'string', description: 'Date début ISO YYYY-MM-DD.' },
      period_end: { type: 'string', description: 'Date fin ISO YYYY-MM-DD.' },
    },
    required: ['account_number', 'period_start', 'period_end'],
  },
};

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

async function findLedgerAccount(numberPrefix) {
  const q = new URLSearchParams({ limit: '50', number_prefix: numberPrefix });
  const data = await pnlFetch(`/ledger_accounts?${q}`);
  return data.items || [];
}

async function fetchAccountEntryLines(accountId, periodStart, periodEnd) {
  const q = new URLSearchParams({
    ledger_account_id: String(accountId),
    period_start: periodStart,
    period_end: periodEnd,
  });
  return paginateAll(`/ledger_entry_lines?${q}`);
}

function asNum(x) { return Number(x ?? 0); }

export async function browseAccountLedger(args = {}) {
  const accountQuery = String(args.account_number || '').trim();
  const periodStart = String(args.period_start || '').slice(0, 10);
  const periodEnd = String(args.period_end || '').slice(0, 10);
  if (!accountQuery) throw new Error('account_number requis');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    throw new Error('period_start et period_end requis au format YYYY-MM-DD');
  }

  const candidates = await findLedgerAccount(accountQuery);
  if (!candidates.length) {
    return `# Grand livre — compte ${accountQuery}\n\nAucun compte commençant par \`${accountQuery}\` trouvé sur ce dossier. Utilisez \`get_chart_of_accounts\` pour explorer le plan comptable.`;
  }

  // Si plusieurs matches, lister et demander précision (mais si un seul match exact, prendre)
  let account = candidates.find((a) => String(a.number) === accountQuery);
  if (!account) {
    if (candidates.length > 1) {
      const list = candidates.slice(0, 20).map((a) => `- \`${a.number}\` — ${a.label || a.name}`).join('\n');
      return `# Grand livre — compte ${accountQuery}\n\n**${candidates.length} comptes** matchent ce préfixe. Précisez le numéro exact :\n\n${list}${candidates.length > 20 ? `\n\n*(... ${candidates.length - 20} autres comptes non affichés)*` : ''}`;
    }
    account = candidates[0];
  }

  const lines = await fetchAccountEntryLines(account.id, periodStart, periodEnd);
  if (!lines.length) {
    return `# Grand livre — compte \`${account.number}\` ${account.label || account.name}\n\n**Aucune écriture** sur ce compte entre ${periodStart} et ${periodEnd}.`;
  }

  // Tri chronologique
  lines.sort((a, b) => String(a.entry_date || a.date || '').localeCompare(String(b.entry_date || b.date || '')));

  // Calcul du solde courant
  let solde = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const enriched = lines.map((l) => {
    const debit = asNum(l.debit ?? l.amount_debit);
    const credit = asNum(l.credit ?? l.amount_credit);
    solde += debit - credit;
    totalDebit += debit;
    totalCredit += credit;
    return { ...l, debit, credit, solde };
  });

  const md = [
    `# Grand livre — compte \`${account.number}\` ${account.label || account.name}\n`,
    `**Période** : ${periodStart} → ${periodEnd}`,
    `**Écritures** : ${enriched.length}`,
    `**Total débit** : ${EUR.format(totalDebit)}`,
    `**Total crédit** : ${EUR.format(totalCredit)}`,
    `**Solde fin de période** : ${EUR.format(solde)} ${solde > 0 ? '(débiteur)' : solde < 0 ? '(créditeur)' : ''}\n`,
  ];

  md.push('## Écritures chronologiques\n');
  md.push('| Date | Journal | Pièce | Libellé | Débit | Crédit | Solde |');
  md.push('|---|---|---|---|---:|---:|---:|');

  // Affiche les 50 premières + les 20 dernières si > 70
  const display = enriched.length > 70
    ? [...enriched.slice(0, 50), { spacer: true }, ...enriched.slice(-20)]
    : enriched;

  for (const l of display) {
    if (l.spacer) {
      md.push(`| … | … | … | *(${enriched.length - 70} écritures intermédiaires non affichées)* | … | … | … |`);
      continue;
    }
    const date = (l.entry_date || l.date || '').slice(0, 10);
    const journal = l.journal_code || l.journal?.code || l.journal_id || '—';
    const piece = l.reference || l.piece_reference || '—';
    const lib = (l.label || l.description || '—').slice(0, 60);
    md.push(`| ${date} | ${journal} | ${piece} | ${lib} | ${l.debit ? EUR.format(l.debit) : ''} | ${l.credit ? EUR.format(l.credit) : ''} | ${EUR.format(l.solde)} |`);
  }

  md.push(`\n*Source : Pennylane Company API v2 · GET /ledger_entry_lines (ledger_account_id=${account.id})*`);
  return md.join('\n');
}
