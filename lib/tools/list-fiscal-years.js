// Tool : list_fiscal_years
// Liste les exercices comptables du dossier Pennylane avec dates + statut (ouvert/clos).
// Utile pour cadrer les périodes (clôture annuelle, balance d'ouverture, etc.).
// Endpoint : GET /fiscal_years. Scope 2026 : à vérifier (probablement implicite).

import { pnlFetch, paginateAll } from '../pennylane-client.js';

export const listFiscalYearsSchema = {
  name: 'list_fiscal_years',
  description: `Liste les **exercices comptables** (fiscal years) du dossier Pennylane avec leur date de début, date de fin, et statut (ouvert / clos / en cours de clôture). Utile pour cadrer les périodes de travail (clôture annuelle, comparatif N-1, balance d'ouverture…).

À utiliser quand l'utilisateur demande :
- "Liste les exercices comptables"
- "Quand commence l'exercice en cours ?"
- "Quel est l'exercice précédent ?"
- "Y a-t-il un exercice ouvert ?"
- "Date de clôture du dernier exercice"
- "Combien d'exercices archivés sur le dossier ?"

Ne prend aucun paramètre — retourne tous les exercices configurés.`,
  inputSchema: { type: 'object', properties: {} },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

async function fetchAllFiscalYears() {
  return paginateAll('/fiscal_years');
}

const STATUS_LABELS = {
  open: 'Ouvert',
  closed: 'Clos',
  closing: 'En clôture',
  current: 'En cours',
};

export async function listFiscalYears() {
  const [years, me] = await Promise.all([fetchAllFiscalYears(), pnlFetch('/me')]);
  const companyName = me?.company?.name || me?.name || 'Dossier';

  if (!years.length) {
    return `# Exercices comptables — ${companyName}\n\nAucun exercice configuré sur ce dossier. Vérifiez la config dans Pennylane → Comptabilité → Paramétrage → Exercices.`;
  }

  // Tri par date de début descendante (plus récent en premier)
  years.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));

  const today = new Date().toISOString().slice(0, 10);
  const current = years.find((y) => {
    const s = y.start_date || '';
    const e = y.end_date || '';
    return s <= today && today <= e;
  });

  const md = [
    `# Exercices comptables — ${companyName}\n`,
    `**${years.length}** exercice(s) configuré(s).`,
  ];

  if (current) {
    md.push(`\n**Exercice en cours** : du ${current.start_date} au ${current.end_date}${current.label ? ` — ${current.label}` : ''} (statut : ${STATUS_LABELS[current.status] || current.status || '—'})`);
  }

  md.push('\n## Liste complète\n');
  md.push('| Période | Libellé | Statut | Clôturé le |');
  md.push('|---|---|---|---|');
  for (const y of years) {
    const period = `${y.start_date || '?'} → ${y.end_date || '?'}`;
    const label = y.label || y.name || '—';
    const status = STATUS_LABELS[y.status] || y.status || '—';
    const closedAt = y.closed_at ? y.closed_at.slice(0, 10) : (y.status === 'closed' ? '✓' : '—');
    md.push(`| ${period} | ${label} | ${status} | ${closedAt} |`);
  }

  md.push(`\n*Source : Pennylane Company API v2 · GET /fiscal_years*`);
  return md.join('\n');
}
