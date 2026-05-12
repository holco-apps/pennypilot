// Tool : browse_journal_entries
// Parcourt les écritures comptables (ledger_entries) sur une période, optionnellement
// filtrées par journal (VE, AC, BQ, OD…). Retourne la liste chronologique des
// écritures avec leur journal d'origine, date, libellé, n° pièce, total débit/crédit.
// Endpoint : GET /ledger_entries. Scope 2026 : ledger_entries:readonly.

import { pnlFetch, paginate, paginateAll } from '../pennylane-client.js';

export const browseJournalEntriesSchema = {
  name: 'browse_journal_entries',
  description: `Liste les **écritures comptables** (ledger entries — pas seulement les lignes) sur une période, optionnellement filtrées par journal. Vue chronologique de l'activité comptable du dossier.

À utiliser quand l'utilisateur demande :
- "Écritures de mai 2026"
- "Toutes les écritures du journal des ventes en avril"
- "Liste les OD du dernier trimestre"
- "Mouvements comptables sur la période X-Y"
- "Quelles écritures dans le journal de banque ?"

Paramètres :
- \`period_start\` (requis) : début période ISO YYYY-MM-DD.
- \`period_end\` (requis) : fin période ISO YYYY-MM-DD.
- \`journal_code\` (optionnel) : code du journal à filtrer (ex : "VE", "AC", "BQ", "OD"). Si absent, toutes les écritures de la période, tous journaux confondus.

Ne PAS utiliser pour :
- Voir les LIGNES d'écriture par compte (utiliser browse_account_ledger)
- Le détail d'une seule écriture (utiliser get_journal_entry_detail)
- La liste des journaux configurés (utiliser list_journals)`,
  inputSchema: {
    type: 'object',
    properties: {
      period_start: { type: 'string', description: 'Date début ISO YYYY-MM-DD.' },
      period_end: { type: 'string', description: 'Date fin ISO YYYY-MM-DD.' },
      journal_code: { type: 'string', description: "Code journal optionnel : 'VE','AC','BQ','OD',etc." },
    },
    required: ['period_start', 'period_end'],
  },
};

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

async function resolveJournalIdByCode(code) {
  const target = code.toUpperCase();
  for await (const j of paginate('/journals')) {
    if (String(j.code || '').toUpperCase() === target) return j;
  }
  return null;
}

async function fetchEntries(periodStart, periodEnd, journalId) {
  const q = new URLSearchParams({ period_start: periodStart, period_end: periodEnd });
  if (journalId) q.set('journal_id', String(journalId));
  return paginateAll(`/ledger_entries?${q}`);
}

function asNum(x) { return Number(x ?? 0); }

export async function browseJournalEntries(args = {}) {
  const periodStart = String(args.period_start || '').slice(0, 10);
  const periodEnd = String(args.period_end || '').slice(0, 10);
  const journalCode = (args.journal_code || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    throw new Error('period_start et period_end requis au format YYYY-MM-DD');
  }

  let journal = null;
  if (journalCode) {
    journal = await resolveJournalIdByCode(journalCode);
    if (!journal) {
      return `# Écritures comptables\n\nAucun journal avec le code \`${journalCode}\` trouvé sur ce dossier. Utilisez \`list_journals\` pour voir la liste des codes disponibles.`;
    }
  }

  const entries = await fetchEntries(periodStart, periodEnd, journal?.id);

  if (!entries.length) {
    return `# Écritures comptables — ${periodStart} → ${periodEnd}${journal ? ` · journal \`${journal.code}\`` : ''}\n\nAucune écriture sur cette période.`;
  }

  entries.sort((a, b) => String(a.entry_date || a.date || '').localeCompare(String(b.entry_date || b.date || '')));

  // Agrégat par journal (si pas de filtre)
  const byJournal = new Map();
  let totalDebit = 0;
  let totalCredit = 0;
  for (const e of entries) {
    const jcode = e.journal_code || e.journal?.code || `id:${e.journal_id || '?'}`;
    if (!byJournal.has(jcode)) byJournal.set(jcode, { count: 0, debit: 0, credit: 0 });
    const agg = byJournal.get(jcode);
    agg.count++;
    const d = asNum(e.total_debit ?? e.debit);
    const c = asNum(e.total_credit ?? e.credit);
    agg.debit += d;
    agg.credit += c;
    totalDebit += d;
    totalCredit += c;
  }

  const md = [
    `# Écritures comptables — ${periodStart} → ${periodEnd}${journal ? ` · journal \`${journal.code}\` ${journal.label || ''}` : ''}\n`,
    `**${entries.length}** écritures · **${EUR.format(totalDebit)}** débit · **${EUR.format(totalCredit)}** crédit\n`,
  ];

  if (!journalCode && byJournal.size > 1) {
    md.push('## Répartition par journal\n');
    md.push('| Journal | Écritures | Total débit | Total crédit |');
    md.push('|---|---:|---:|---:|');
    for (const [j, agg] of [...byJournal.entries()].sort((a, b) => b[1].count - a[1].count)) {
      md.push(`| \`${j}\` | ${agg.count} | ${EUR.format(agg.debit)} | ${EUR.format(agg.credit)} |`);
    }
  }

  // Liste détaillée (top 50, puis 20 derniers si > 70)
  const display = entries.length > 70 ? [...entries.slice(0, 50), { spacer: true }, ...entries.slice(-20)] : entries;

  md.push(`\n## Détail chronologique\n`);
  md.push('| Date | Journal | Pièce | Libellé | Débit | Crédit |');
  md.push('|---|---|---|---|---:|---:|');
  for (const e of display) {
    if (e.spacer) {
      md.push(`| … | … | … | *(${entries.length - 70} écritures intermédiaires non affichées)* | … | … |`);
      continue;
    }
    const date = (e.entry_date || e.date || '').slice(0, 10);
    const jcode = e.journal_code || e.journal?.code || '—';
    const piece = e.reference || e.piece_reference || `#${String(e.id ?? '').slice(0, 8)}`;
    const lib = (e.label || e.description || '—').slice(0, 70);
    const d = asNum(e.total_debit ?? e.debit);
    const c = asNum(e.total_credit ?? e.credit);
    md.push(`| ${date} | ${jcode} | ${piece} | ${lib} | ${d ? EUR.format(d) : ''} | ${c ? EUR.format(c) : ''} |`);
  }

  md.push(`\n*Source : Pennylane Company API v2 · GET /ledger_entries${journal ? ` (journal_id=${journal.id})` : ''}*`);
  return md.join('\n');
}
