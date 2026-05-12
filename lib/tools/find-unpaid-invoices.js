// Tool : find_unpaid_customer_invoices
// Liste les factures clients non payées avec deadline dépassée.
// Output : résumé chiffré + top 20 factures par ancienneté + alerte > 60j + top 3 clients.

import { pnlFetch, paginate, stream } from '../pennylane-client.js';

export const findUnpaidInvoicesSchema = {
  name: 'find_unpaid_customer_invoices',
  description: `Liste les factures clients **non payées** dont l'échéance est dépassée pour le dossier comptable courant Pennylane. Renvoie un résumé chiffré (nombre de factures, montant total TTC dû, top 3 clients en retard), un signalement spécifique des factures avec plus de 60 jours de retard, et le détail des 20 plus anciennes.

À utiliser quand l'utilisateur demande :
- "Quelles factures clients sont en retard ?"
- "Combien d'argent on attend des clients ?"
- "Liste les impayés"
- "Qui me doit de l'argent ?"
- "Factures en retard de plus de X jours"

Ne PAS utiliser pour :
- Les factures **fournisseurs** non payées (à venir : find_unpaid_supplier_invoices)
- Le détail d'**une seule facture** (utiliser un autre tool quand il existera)
- Un calcul de chiffre d'affaires ou de marge (utiliser get_company_pnl)`,
  inputSchema: {
    type: 'object',
    properties: {
      days_overdue: {
        type: 'number',
        description:
          "Seuil minimum de jours de retard. Optionnel, défaut 0 (toutes les factures avec échéance passée). Mettre 30 pour filtrer les factures avec plus de 30 jours de retard, etc.",
      },
    },
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

async function fetchCustomerNames() {
  const map = new Map();
  for await (const c of paginate('/customers')) map.set(c.id, c.name);
  return map;
}

function lateDaysOf(inv, now) {
  if (!inv.deadline) return -Infinity;
  const due = new Date(inv.deadline + 'T00:00:00Z');
  return Math.floor((now - due) / DAY_MS);
}

export async function findUnpaidInvoices(args = {}) {
  const daysOverdue = Number(args.days_overdue ?? 0);
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  // Pipeline lazy : filtre + projection côté flux (les pages s'arrêtent
  // dès que les filtres sont satisfaits — utile sur les très gros dossiers
  // une fois que Pennylane exposera `?paid=false` côté API).
  const [overdue, customerNames, me] = await Promise.all([
    stream('/customer_invoices')
      .filter((inv) => inv.paid !== true && inv.deadline)
      .map((inv) => ({ inv, lateDays: lateDaysOf(inv, now) }))
      .filter(({ lateDays }) => lateDays >= daysOverdue)
      .toArray(),
    fetchCustomerNames(),
    pnlFetch('/me'),
  ]);

  // Hydratation des noms clients post-collecte (pour bénéficier du dedup sur /me et de la concurrence).
  for (const o of overdue) {
    const inv = o.inv;
    o.id = inv.id;
    o.number = inv.invoice_number || inv.external_reference || `#${inv.id}`;
    o.customerName = customerNames.get(inv.customer?.id) || '(client inconnu)';
    o.date = inv.date;
    o.deadline = inv.deadline;
    o.amountTtc = Number(inv.currency_amount || 0);
    o.draft = inv.draft === true;
    delete o.inv;
  }

  if (overdue.length === 0) {
    const seuil = daysOverdue > 0 ? ` de plus de ${daysOverdue} jours` : '';
    return `**Aucune facture client en retard${seuil}** dans le dossier ${me.company.name} au ${todayIso}.\n\n_Source : Pennylane, dossier ${me.company.name} (${me.company.reg_no}), évaluation au ${todayIso}._`;
  }

  overdue.sort((a, b) => b.lateDays - a.lateDays);

  const totalTtc = overdue.reduce((s, o) => s + o.amountTtc, 0);
  const seuilLabel = daysOverdue > 0 ? ` (retard ≥ ${daysOverdue}j)` : '';

  // Top 3 clients par montant cumulé
  const byCustomer = new Map();
  for (const o of overdue) {
    const cur = byCustomer.get(o.customerName) || { total: 0, count: 0 };
    cur.total += o.amountTtc;
    cur.count += 1;
    byCustomer.set(o.customerName, cur);
  }
  const top3 = [...byCustomer.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3);

  // Alerte > 60 jours
  const critical = overdue.filter((o) => o.lateDays > 60);

  const lines = [];
  lines.push(`**Factures clients non payées${seuilLabel}**`);
  lines.push('');
  lines.push(`Dossier : ${me.company.name} (${me.company.reg_no})`);
  lines.push(`Évaluation au ${todayIso}`);
  lines.push('');
  lines.push(`**Total : ${overdue.length} facture${overdue.length > 1 ? 's' : ''} en retard — ${EUR.format(totalTtc)} dû TTC**`);
  lines.push('');

  if (critical.length > 0) {
    lines.push(`🔴 **Alerte — ${critical.length} facture${critical.length > 1 ? 's' : ''} avec plus de 60 jours de retard :**`);
    for (const c of critical.slice(0, 10)) {
      lines.push(`- **${c.customerName}** · ${c.number} · échéance ${c.deadline} · **${c.lateDays} jours de retard** · ${EUR.format(c.amountTtc)}`);
    }
    if (critical.length > 10) lines.push(`- ... et ${critical.length - 10} autre${critical.length - 10 > 1 ? 's' : ''}`);
    lines.push('');
  }

  lines.push('**Top 20 factures par ancienneté de retard :**');
  for (const o of overdue.slice(0, 20)) {
    const flag = o.draft ? ' _(brouillon)_' : '';
    lines.push(`- ${o.customerName} · ${o.number} · échéance ${o.deadline} · ${o.lateDays}j · ${EUR.format(o.amountTtc)}${flag}`);
  }
  if (overdue.length > 20) lines.push(`- ... et ${overdue.length - 20} autres factures plus récentes`);
  lines.push('');

  lines.push('**Top 3 clients par montant en retard :**');
  for (const [name, info] of top3) {
    lines.push(`- ${name} : **${EUR.format(info.total)}** (${info.count} facture${info.count > 1 ? 's' : ''})`);
  }
  lines.push('');

  lines.push(`_Source : Pennylane, dossier ${me.company.name} (${me.company.reg_no}), évaluation au ${todayIso}._`);

  return lines.join('\n');
}
