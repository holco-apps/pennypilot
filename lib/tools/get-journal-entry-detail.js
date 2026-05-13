// Tool : get_journal_entry_detail
// Détail d'une écriture comptable précise : toutes ses lignes (débit/crédit), pièces jointes
// éventuelles, lettrage. Utilisé pour audit / vérification d'une écriture spécifique.
// Endpoints : GET /ledger_entries/{id} + GET /ledger_entries/{id}/ledger_entry_lines.

import { pnlFetch, paginateAll } from '../pennylane-client.js';

export const getJournalEntryDetailSchema = {
  name: 'get_journal_entry_detail',
  description: `Récupère le **détail complet d'une écriture comptable** : entête (date, journal, libellé, référence, statut), toutes ses lignes débit/crédit par compte, et informations associées (pièces jointes liées, état de lettrage). Permet l'audit ou la vérification d'une écriture précise.

À utiliser quand l'utilisateur demande :
- "Détail de l'écriture #X"
- "Vérifie cette écriture (id=...)"
- "Toutes les lignes de l'écriture du 15 mai journal des ventes"
- "Cette écriture est-elle équilibrée ?"

Paramètres :
- \`entry_id\` (requis) : l'identifiant Pennylane de l'écriture (vu dans la sortie de browse_journal_entries ou browse_account_ledger).

Ne PAS utiliser pour :
- Lister plusieurs écritures (utiliser browse_journal_entries)
- Voir les écritures d'UN compte sur une période (utiliser browse_account_ledger)`,
  inputSchema: {
    type: 'object',
    properties: {
      entry_id: { type: 'string', description: 'ID Pennylane de l\'écriture comptable (champ "id" dans les listes).' },
    },
    required: ['entry_id'],
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

async function fetchEntryLines(entryId) {
  return paginateAll(`/ledger_entries/${encodeURIComponent(entryId)}/ledger_entry_lines`);
}

function asNum(x) { return Number(x ?? 0); }

export async function getJournalEntryDetail(args = {}) {
  const id = String(args.entry_id || '').trim();
  if (!id) throw new Error('entry_id requis');

  let entry;
  try {
    entry = await pnlFetch(`/ledger_entries/${encodeURIComponent(id)}`);
  } catch (err) {
    return `# Écriture ${id}\n\n**Erreur** : ${err.message}\n\nVérifiez que l'ID est correct (visible dans la sortie de \`browse_journal_entries\` ou \`browse_account_ledger\`).`;
  }

  const lines = await fetchEntryLines(id);

  const jcode = entry.journal_code || entry.journal?.code || '—';
  const date = (entry.entry_date || entry.date || '').slice(0, 10);
  const totalDebit = lines.reduce((s, l) => s + asNum(l.debit ?? l.amount_debit), 0);
  const totalCredit = lines.reduce((s, l) => s + asNum(l.credit ?? l.amount_credit), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const md = [
    `# Écriture comptable \`${id}\`\n`,
    `**Date** : ${date}`,
    `**Journal** : ${jcode} ${entry.journal?.label ? `(${entry.journal.label})` : ''}`,
    `**Libellé** : ${entry.label || entry.description || '—'}`,
    `**Référence pièce** : ${entry.reference || entry.piece_reference || '—'}`,
    `**Total débit** : ${EUR.format(totalDebit)}`,
    `**Total crédit** : ${EUR.format(totalCredit)}`,
    `**Équilibrée** : ${balanced ? '✅ Oui' : '❌ Non — écart de ' + EUR.format(Math.abs(totalDebit - totalCredit))}`,
  ];

  if (entry.status) md.push(`**Statut** : \`${entry.status}\``);
  if (entry.created_at) md.push(`**Créée le** : ${entry.created_at.slice(0, 10)}`);
  if (entry.updated_at && entry.updated_at !== entry.created_at) md.push(`**Modifiée le** : ${entry.updated_at.slice(0, 10)}`);

  md.push(`\n## Lignes d'écriture (${lines.length})\n`);
  if (!lines.length) {
    md.push('*(aucune ligne — anomalie Pennylane)*');
  } else {
    md.push('| Compte | Libellé | Débit | Crédit | Lettrage |');
    md.push('|---|---|---:|---:|---|');
    for (const l of lines) {
      const acc = l.ledger_account_number || l.account_number || '—';
      const accLabel = l.ledger_account_label || l.account_label || '';
      const lib = (l.label || l.description || '').slice(0, 60);
      const d = asNum(l.debit ?? l.amount_debit);
      const c = asNum(l.credit ?? l.amount_credit);
      const lettering = l.lettering_state === 'lettered' ? '🔗' : l.lettering_state === 'partial' ? '~' : '';
      md.push(`| \`${acc}\` ${accLabel ? ' ' + accLabel : ''} | ${lib || '—'} | ${d ? EUR.format(d) : ''} | ${c ? EUR.format(c) : ''} | ${lettering} |`);
    }
  }

  md.push(`\n*Source : Pennylane Company API v2 · GET /ledger_entries/${id}*`);
  return md.join('\n');
}
