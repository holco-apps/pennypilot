// Tool 1 : find_unpaid_customer_invoices
// Liste les factures clients non payées avec deadline dépassée.
// Output : résumé chiffré + top 20 factures par ancienneté + alerte > 60j + top 3 clients.

import { pnlFetch } from '../pennylane-client.js';

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

/** Récupère TOUTES les factures clients via cursor pagination. */
async function fetchAllCustomerInvoices() {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const path = `/customer_invoices?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await pnlFetch(path);
    all.push(...(data.items || []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return all;
}

/** Mapping {customer.id -> customer.name} via une requête /customers paginée. */
async function fetchCustomerNames() {
  const map = new Map();
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const path = `/customers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await pnlFetch(path);
    for (const c of data.items || []) map.set(c.id, c.name);
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return map;
}

export async function findUnpaidInvoices(args = {}) {
  const daysOverdue = Number(args.days_overdue ?? 0);
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const [allInvoices, customerNames, me] = await Promise.all([
    fetchAllCustomerInvoices(),
    fetchCustomerNames(),
    pnlFetch('/me'),
  ]);

  // Filtre : non payée + deadline dépassée + retard >= seuil
  const overdue = [];
  for (const inv of allInvoices) {
    if (inv.paid === true) continue;
    if (!inv.deadline) continue;
    const due = new Date(inv.deadline + 'T00:00:00Z');
    const lateDays = Math.floor((now - due) / DAY_MS);
    if (lateDays < daysOverdue) continue;
    overdue.push({
      id: inv.id,
      number: inv.invoice_number || inv.external_reference || `#${inv.id}`,
      customerId: inv.customer?.id,
      customerName: customerNames.get(inv.customer?.id) || '(client inconnu)',
      date: inv.date,
      deadline: inv.deadline,
      lateDays,
      amountTtc: Number(inv.currency_amount || 0),
      draft: inv.draft === true,
    });
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
