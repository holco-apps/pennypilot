// Tool : get_chart_of_accounts
// Retourne le plan comptable du dossier Pennylane, groupé par classe PCG.
// Endpoint : GET /ledger_accounts. Scope 2026 : ledger_accounts:readonly.

import { pnlFetch, paginateAll } from '../pennylane-client.js';

export const getChartOfAccountsSchema = {
  name: 'get_chart_of_accounts',
  description: `Récupère le **plan comptable** (chart of accounts) du dossier Pennylane, groupé par classe PCG (1=capitaux, 2=immobilisations, 3=stocks, 4=tiers, 5=trésorerie, 6=charges, 7=produits). Retourne pour chaque compte son numéro, son libellé, sa classe, et son flag actif/utilisé.

À utiliser quand l'utilisateur demande :
- "Donne-moi le plan comptable du dossier"
- "Quels comptes 6xxx sont utilisés ?" / "Liste les comptes de la classe 5"
- "Le compte 411000 existe-t-il sur ce dossier ?"
- "Comment est ventilé le plan comptable ?"
- "Lister tous les comptes fournisseurs"

Optionnellement filtrable par préfixe de numéro (ex : "6" pour toutes les charges, "411" pour comptes clients individuels). Sans filtre, retourne les classes 1-7 résumées + détail classes 4-6-7 (les plus utilisées en exploitation).

Ne PAS utiliser pour :
- Voir les **écritures** d'un compte (utiliser browse_account_ledger)
- Le solde d'un compte (utiliser get_company_pnl ou browse_account_ledger qui inclut les soldes)`,
  inputSchema: {
    type: 'object',
    properties: {
      account_prefix: {
        type: 'string',
        description:
          "Filtre optionnel sur le préfixe du numéro de compte. Ex : '6' (toutes charges), '60' (achats), '411' (comptes clients individuels), '512' (comptes banques). Sans filtre, vue globale du plan.",
      },
    },
  },
};

const CLASS_LABELS = {
  '1': 'Comptes de capitaux',
  '2': "Comptes d'immobilisations",
  '3': 'Comptes de stocks et en-cours',
  '4': 'Comptes de tiers',
  '5': 'Comptes financiers',
  '6': 'Comptes de charges',
  '7': 'Comptes de produits',
  '8': 'Comptes spéciaux',
};

async function fetchAllLedgerAccounts(prefix) {
  const q = new URLSearchParams();
  if (prefix) q.set('number_prefix', prefix);
  const qs = q.toString();
  return paginateAll(`/ledger_accounts${qs ? `?${qs}` : ''}`);
}

export async function getChartOfAccounts(args = {}) {
  const prefix = (args.account_prefix || '').trim();
  const [accounts, me] = await Promise.all([fetchAllLedgerAccounts(prefix), pnlFetch('/me')]);
  const companyName = me?.company?.name || me?.name || 'Dossier';

  if (!accounts.length) {
    return `# Plan comptable — ${companyName}${prefix ? ` (filtre : ${prefix}*)` : ''}\n\nAucun compte ${prefix ? `commençant par ${prefix}` : ''} trouvé sur ce dossier Pennylane.`;
  }

  // Groupage par classe (premier digit)
  const byClass = new Map();
  for (const a of accounts) {
    const num = String(a.number || '');
    const cls = num.charAt(0) || '?';
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push(a);
  }

  const lines = [`# Plan comptable — ${companyName}${prefix ? ` · filtre \`${prefix}*\`` : ''}\n`];
  lines.push(`**${accounts.length}** comptes ${prefix ? 'matchant' : 'au total'} dans ce dossier.\n`);

  // Si pas de filtre, mode résumé : juste les comptes par classe en compact
  // Si filtre, mode détaillé : tableau complet
  if (prefix || accounts.length <= 80) {
    for (const cls of [...byClass.keys()].sort()) {
      const list = byClass.get(cls);
      const label = CLASS_LABELS[cls] || `Classe ${cls}`;
      lines.push(`\n## Classe ${cls} — ${label} (${list.length} comptes)\n`);
      lines.push('| N° compte | Libellé |');
      lines.push('|---|---|');
      for (const a of list.sort((x, y) => String(x.number || '').localeCompare(String(y.number || '')))) {
        lines.push(`| \`${a.number || '—'}\` | ${a.label || a.name || '—'} |`);
      }
    }
  } else {
    // Vue résumé par classe
    lines.push(`\n*Vue résumée par classe (filtre par classe pour voir le détail : ex \`get_chart_of_accounts(account_prefix: "6")\`).*\n`);
    lines.push('| Classe | Libellé | Comptes |');
    lines.push('|---|---|---|');
    for (const cls of [...byClass.keys()].sort()) {
      const list = byClass.get(cls);
      const label = CLASS_LABELS[cls] || `Classe ${cls}`;
      lines.push(`| **${cls}** | ${label} | ${list.length} |`);
    }
  }

  lines.push(`\n*Source : Pennylane Company API v2 · GET /ledger_accounts*`);
  return lines.join('\n');
}
