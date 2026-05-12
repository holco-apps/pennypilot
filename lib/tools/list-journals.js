// Tool : list_journals
// Liste tous les journaux comptables du dossier Pennylane (ventes, achats, banque, OD…).
// Endpoint : GET /journals (paginé). Scope 2026 : journals:readonly.

import { pnlFetch } from '../pennylane-client.js';

export const listJournalsSchema = {
  name: 'list_journals',
  description: `Liste **tous les journaux comptables** (livres journaux) du dossier Pennylane : journal des ventes (VE), journal des achats (AC), journal de banque (BQ), journal des opérations diverses (OD), etc. Retourne pour chaque journal son code, son libellé, son type, et un compteur du nombre d'écritures de la période courante si disponible.

À utiliser quand l'utilisateur demande :
- "Liste les journaux du dossier"
- "Quels sont les codes journaux utilisés ?"
- "Quels journaux sont configurés sur le dossier ?"
- "C'est quoi le code journal VE / AC / BQ ici ?"

Ne PAS utiliser pour :
- Voir les **écritures** d'un journal précis (utiliser browse_account_ledger ou browse_journal_entries)
- Le plan comptable (utiliser get_chart_of_accounts)`,
  inputSchema: { type: 'object', properties: {} },
};

async function fetchAllJournals() {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const path = `/journals?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await pnlFetch(path);
    all.push(...(data.items || []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return all;
}

const TYPE_LABELS = {
  sales: 'Ventes',
  purchases: 'Achats',
  bank: 'Banque',
  general: 'Opérations diverses (OD)',
  cash: 'Caisse',
  miscellaneous: 'Divers',
};

export async function listJournals() {
  const [journals, me] = await Promise.all([fetchAllJournals(), pnlFetch('/me')]);
  const companyName = me?.company?.name || me?.name || 'Dossier';

  if (!journals.length) {
    return `# Journaux comptables — ${companyName}\n\nAucun journal n'est configuré sur ce dossier Pennylane. Vérifiez la config dans Pennylane → Comptabilité → Paramétrage → Journaux.`;
  }

  // Groupage par type
  const byType = new Map();
  for (const j of journals) {
    const k = j.type || 'unknown';
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k).push(j);
  }

  const lines = [`# Journaux comptables — ${companyName}\n`, `**${journals.length}** journaux configurés.\n`];
  for (const [type, list] of byType) {
    const label = TYPE_LABELS[type] || type;
    lines.push(`\n## ${label} (${list.length})\n`);
    lines.push('| Code | Libellé | Type | ID |');
    lines.push('|---|---|---|---|');
    for (const j of list.sort((a, b) => (a.code || '').localeCompare(b.code || ''))) {
      lines.push(`| **${j.code || '—'}** | ${j.label || '—'} | ${j.type || '—'} | \`${j.id}\` |`);
    }
  }

  lines.push(`\n*Source : Pennylane Company API v2 · GET /journals*`);
  return lines.join('\n');
}
