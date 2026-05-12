// Tool : find_unlettered_entries
// Trouve les écritures en attente de lettrage (clients / fournisseurs).
// Très utile pour les collaborateurs cabinet : c'est une vraie tâche métier répétitive.
// Endpoint : GET /ledger_entry_lines + filtre lettering_state=unlettered.
// Scope 2026 : ledger_entries:readonly.

import { pnlFetch } from '../pennylane-client.js';

export const findUnletteredEntriesSchema = {
  name: 'find_unlettered_entries',
  description: `Liste les **écritures non lettrées** (lettrage en attente) sur les comptes clients (411*) ou fournisseurs (401*) du dossier Pennylane. Renvoie un résumé par compte avec montant en attente, nombre d'écritures, top 20 par ancienneté.

Le lettrage = associer une facture à son règlement (ou plusieurs règlements à plusieurs factures qui se compensent). C'est une tâche répétitive cabinet, qui prend du temps mais qui dégage la lecture des soldes clients / fournisseurs.

À utiliser quand l'utilisateur demande :
- "Quelles écritures sont en attente de lettrage ?"
- "Liste les comptes clients qui ont du lettrage à faire"
- "Combien d'écritures fournisseurs non lettrées ?"
- "Faut-il lettrer le compte 411 ABCDE ?"
- "Liste les vieilles écritures non lettrées"

Paramètres optionnels :
- \`account_class\` : "customers" (411*) | "suppliers" (401*) | "both" (défaut : both).
- \`older_than_days\` : seuil d'ancienneté minimum en jours (défaut 0).

Ne PAS utiliser pour :
- Voir le détail d'un compte (utiliser browse_account_ledger)
- Faire le lettrage lui-même (l'API v0.2 de PennyPilot est en lecture seule)`,
  inputSchema: {
    type: 'object',
    properties: {
      account_class: {
        type: 'string',
        enum: ['customers', 'suppliers', 'both'],
        description: "'customers' (411*), 'suppliers' (401*), ou 'both'. Défaut : both.",
      },
      older_than_days: {
        type: 'number',
        description: 'Filtre les écritures de plus de N jours. Défaut 0 (toutes).',
      },
    },
  },
};

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchUnletteredLines(accountPrefix) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const q = new URLSearchParams({
      limit: '100',
      lettering_state: 'unlettered',
      ledger_account_number_prefix: accountPrefix,
    });
    if (cursor) q.set('cursor', cursor);
    let data;
    try {
      data = await pnlFetch(`/ledger_entry_lines?${q}`);
    } catch (err) {
      // Si l'endpoint ne supporte pas le filtre lettering_state, retomber sur fetch tous + filter local
      throw new Error(
        `Endpoint /ledger_entry_lines filtre 'lettering_state' indisponible ou refusé (${err.message}). Vérifier scopes Pennylane.`,
      );
    }
    all.push(...(data.items || []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return all;
}

function asNum(x) { return Number(x ?? 0); }

export async function findUnletteredEntries(args = {}) {
  const klass = args.account_class || 'both';
  const olderThanDays = Number(args.older_than_days ?? 0);
  const now = Date.now();
  const threshold = now - olderThanDays * DAY_MS;

  const prefixes = klass === 'customers' ? ['411'] : klass === 'suppliers' ? ['401'] : ['411', '401'];

  const allLines = [];
  for (const p of prefixes) {
    try {
      const lines = await fetchUnletteredLines(p);
      allLines.push(...lines);
    } catch (err) {
      return `# Lettrage en attente\n\n**Erreur d'accès Pennylane** : ${err.message}\n\nLe filtre \`lettering_state=unlettered\` n'est peut-être pas encore disponible sur ce dossier (feature dépendante de la migration API 2026 Pennylane). Contactez alan@holco.co.`;
    }
  }

  // Filtre par ancienneté
  const filtered = allLines.filter((l) => {
    const d = new Date(l.entry_date || l.date || 0).getTime();
    return d > 0 && d <= threshold;
  });

  if (!filtered.length) {
    return `# Lettrage en attente\n\nAucune écriture non lettrée trouvée sur les comptes ${prefixes.join(', ')}*${olderThanDays > 0 ? ` (avec plus de ${olderThanDays} jours)` : ''}. Soit le lettrage est à jour 🎉, soit le filtre Pennylane ne renvoie rien.`;
  }

  // Agréger par compte
  const byAccount = new Map();
  for (const l of filtered) {
    const accNum = l.ledger_account_number || l.account_number || '???';
    const accLabel = l.ledger_account_label || l.account_label || '';
    const key = `${accNum}|${accLabel}`;
    if (!byAccount.has(key)) byAccount.set(key, { number: accNum, label: accLabel, debit: 0, credit: 0, count: 0, oldestDate: null });
    const agg = byAccount.get(key);
    agg.debit += asNum(l.debit ?? l.amount_debit);
    agg.credit += asNum(l.credit ?? l.amount_credit);
    agg.count++;
    const d = (l.entry_date || l.date || '').slice(0, 10);
    if (!agg.oldestDate || d < agg.oldestDate) agg.oldestDate = d;
  }

  const sortedAccounts = [...byAccount.values()].sort((a, b) =>
    Math.abs(b.debit - b.credit) - Math.abs(a.debit - a.credit),
  );

  const md = [
    `# Lettrage en attente — ${prefixes.map(p => p.startsWith('411') ? 'clients (411)' : 'fournisseurs (401)').join(' + ')}\n`,
    `**${filtered.length}** écritures non lettrées${olderThanDays > 0 ? ` (avec plus de ${olderThanDays} jours)` : ''}`,
    `**${byAccount.size}** comptes concernés\n`,
  ];

  md.push('## Comptes à lettrer (par enjeu décroissant)\n');
  md.push('| N° compte | Libellé | Solde net (D−C) | Écritures | Plus ancienne |');
  md.push('|---|---|---:|---:|---|');
  for (const a of sortedAccounts.slice(0, 20)) {
    md.push(`| \`${a.number}\` | ${a.label || '—'} | ${EUR.format(a.debit - a.credit)} | ${a.count} | ${a.oldestDate || '—'} |`);
  }
  if (sortedAccounts.length > 20) md.push(`\n*(${sortedAccounts.length - 20} comptes supplémentaires non affichés)*`);

  // Top 10 écritures les plus anciennes
  const oldest = [...filtered].sort((a, b) =>
    String(a.entry_date || a.date || '').localeCompare(String(b.entry_date || b.date || '')),
  ).slice(0, 10);

  md.push('\n## Top 10 plus anciennes\n');
  md.push('| Date | Compte | Libellé | Débit | Crédit |');
  md.push('|---|---|---|---:|---:|');
  for (const l of oldest) {
    const date = (l.entry_date || l.date || '').slice(0, 10);
    const acc = l.ledger_account_number || '—';
    const lib = (l.label || l.description || '—').slice(0, 60);
    const d = asNum(l.debit ?? l.amount_debit);
    const c = asNum(l.credit ?? l.amount_credit);
    md.push(`| ${date} | \`${acc}\` | ${lib} | ${d ? EUR.format(d) : ''} | ${c ? EUR.format(c) : ''} |`);
  }

  md.push(`\n*Source : Pennylane Company API v2 · GET /ledger_entry_lines (lettering_state=unlettered, ledger_account_number_prefix=${prefixes.join(' | ')})*`);
  return md.join('\n');
}
