// Playbook : note de synthèse mensuelle pour cabinet d'expertise comptable.
// Compose 5 sections (P&L, trésorerie, dépenses anormales, anomalies, actions)
// à partir de plusieurs endpoints Pennylane.
//
// La séparation playbook / tool prépare la v0.3 où l'adapter HTTP Mistral
// réutilisera ce playbook tel quel via un autre transport.

import { pnlFetch, paginate, paginateAll } from '../pennylane-client.js';

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Parsing / dates
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

function lastDayOf(y, m) {
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthRange(y, m) {
  return {
    label: `${y}-${pad2(m)}`,
    start: `${y}-${pad2(m)}-01`,
    end: lastDayOf(y, m),
  };
}

function parseMonth(input) {
  const m = (input || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    throw new Error(`Format de mois invalide : "${input}". Attendu : "YYYY-MM" (ex : "2026-04").`);
  }
  const y = +m[1];
  const month = +m[2];
  if (month < 1 || month > 12) throw new Error(`Mois invalide : ${month}`);

  const curr = monthRange(y, month);
  const prev = (k) => {
    const totalMonths = y * 12 + (month - 1) - k;
    return monthRange(Math.floor(totalMonths / 12), (totalMonths % 12) + 1);
  };

  return {
    curr,
    m1: prev(1),
    m2: prev(2),
    m3: prev(3),
  };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchClass6Charges(start, end) {
  const all = await paginateAll(`/trial_balance?period_start=${start}&period_end=${end}`);
  return all
    .filter((it) => String(it.number || '').startsWith('6'))
    .map((it) => ({
      number: it.number,
      label: it.label,
      charge: Number(it.debits || 0) - Number(it.credits || 0),
    }));
}

async function fetchAllCustomerInvoices() {
  return paginateAll('/customer_invoices');
}

async function fetchAllSupplierInvoices() {
  return paginateAll('/supplier_invoices');
}

async function fetchCustomerNames() {
  const map = new Map();
  for await (const c of paginate('/customers')) map.set(c.id, c.name);
  return map;
}

async function fetchSupplierNames() {
  const map = new Map();
  for await (const s of paginate('/suppliers')) map.set(s.id, s.name);
  return map;
}

// ---------------------------------------------------------------------------
// Calculs métier
// ---------------------------------------------------------------------------

function aggregateChargesBuckets(class6) {
  const b = { achats: 0, services: 0, impots: 0, personnel: 0, autres: 0 };
  for (const a of class6) {
    if (a.number.startsWith('60')) b.achats += a.charge;
    else if (a.number.startsWith('61') || a.number.startsWith('62')) b.services += a.charge;
    else if (a.number.startsWith('63')) b.impots += a.charge;
    else if (a.number.startsWith('64')) b.personnel += a.charge;
    else b.autres += a.charge;
  }
  b.total = Object.values(b).reduce((s, v) => s + v, 0);
  return b;
}

function detectAnomalousExpenses(currClass6, prevList) {
  // prevList = [class6_M1, class6_M2, class6_M3]
  const accountsByNumber = new Map();
  const addAll = (list, key) => {
    for (const a of list) {
      const cur = accountsByNumber.get(a.number) || {
        number: a.number,
        label: a.label,
        curr: 0,
        prev: [0, 0, 0],
      };
      cur.label = a.label || cur.label;
      if (key === -1) cur.curr = a.charge;
      else cur.prev[key] = a.charge;
      accountsByNumber.set(a.number, cur);
    }
  };
  addAll(currClass6, -1);
  prevList.forEach((list, i) => addAll(list, i));

  const flagged = [];
  for (const acc of accountsByNumber.values()) {
    const avg = (acc.prev[0] + acc.prev[1] + acc.prev[2]) / 3;
    const absDiff = acc.curr - avg;
    const relDiff = avg !== 0 ? absDiff / Math.abs(avg) : acc.curr !== 0 ? Infinity : 0;

    const minRelevant = 100; // ignore les comptes trop petits
    if (Math.abs(absDiff) < minRelevant) continue;

    // Cas 1 : variation > 30%
    // Cas 2 : disparition (avg > 0 mais curr = 0) → cut-off potentiel
    // Cas 3 : pic (curr > 2× avg)
    const isMajor = Math.abs(relDiff) > 0.3;
    const isVanish = avg > minRelevant && acc.curr === 0;
    const isSpike = acc.curr > 2 * avg && avg > 0;

    if (isMajor || isVanish || isSpike) {
      flagged.push({
        number: acc.number,
        label: acc.label,
        curr: acc.curr,
        avg,
        absDiff,
        relDiff,
        kind: isVanish ? 'vanish' : isSpike ? 'spike' : 'major',
      });
    }
  }

  flagged.sort((a, b) => Math.abs(b.absDiff) - Math.abs(a.absDiff));
  return flagged.slice(0, 5);
}

function detectDuplicateSupplierInvoices(supplierInvoices, range, supplierNames) {
  const inMonth = supplierInvoices.filter(
    (i) => i.date >= range.start && i.date <= range.end
  );

  const groups = new Map();
  for (const inv of inMonth) {
    const supId = inv.supplier?.id;
    const amount = inv.currency_amount;
    if (!supId || !amount) continue;
    // Arrondi à l'euro (en centimes) pour matcher 1140.00 vs 1140 vs 1140.0
    const key = `${supId}|${Math.round(Number(amount) * 100)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(inv);
  }

  const dupes = [];
  for (const [key, list] of groups) {
    if (list.length >= 2) {
      const supId = list[0].supplier?.id;
      dupes.push({
        supplierName: supplierNames.get(supId) || `(supplier ${supId})`,
        amount: Number(list[0].currency_amount),
        count: list.length,
        refs: list.map((l) => l.external_reference || `#${l.id}`),
      });
    }
  }
  return dupes;
}

function summarizeOverdueInvoices(invoices, customerNames, today) {
  const overdue = [];
  for (const inv of invoices) {
    if (inv.paid === true || !inv.deadline) continue;
    const due = new Date(inv.deadline + 'T00:00:00Z');
    const lateDays = Math.floor((today - due) / DAY_MS);
    if (lateDays < 0) continue;
    overdue.push({
      lateDays,
      amountTtc: Number(inv.currency_amount || 0),
      customerName: customerNames.get(inv.customer?.id) || '(client inconnu)',
    });
  }
  overdue.sort((a, b) => b.lateDays - a.lateDays);

  const totalTtc = overdue.reduce((s, o) => s + o.amountTtc, 0);
  const critical = overdue.filter((o) => o.lateDays > 60).length;

  // Top 3 clients par montant cumulé
  const byCustomer = new Map();
  for (const o of overdue) {
    const cur = byCustomer.get(o.customerName) || { total: 0, count: 0 };
    cur.total += o.amountTtc;
    cur.count++;
    byCustomer.set(o.customerName, cur);
  }
  const top3 = [...byCustomer.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3);

  return { count: overdue.length, totalTtc, critical, oldest: overdue[0]?.lateDays || 0, top3 };
}

function sumRevenueInPeriod(invoices, start, end) {
  let total = 0;
  let count = 0;
  for (const inv of invoices) {
    if (!inv.date) continue;
    if (inv.date < start || inv.date > end) continue;
    total += Number(inv.currency_amount_before_tax || 0);
    count++;
  }
  return { total, count };
}

// ---------------------------------------------------------------------------
// Composition Markdown selon le tone
// ---------------------------------------------------------------------------

function fmtAnomaly(a) {
  const sign = a.absDiff >= 0 ? '+' : '';
  const pctText =
    a.relDiff === Infinity || a.relDiff === -Infinity
      ? 'nouveau'
      : `${sign}${PCT.format(a.relDiff)}`;
  const flag = a.kind === 'vanish' ? '🔴' : a.kind === 'spike' ? '🔴' : '⚠️';
  const tag = a.kind === 'vanish' ? '(disparition / cut-off potentiel)' : a.kind === 'spike' ? '(pic anormal)' : '';
  return `${flag} ${a.number} ${a.label || ''} : **${EUR.format(a.curr)}** vs moy. ${EUR.format(a.avg)} → ${pctText} ${tag}`.trim();
}

function buildActions({ anomalies, dupes, overdue, draftRatio }) {
  const actions = [];
  if (draftRatio > 0.5) {
    actions.push(
      `Reprendre le **process de facturation** : ${PCT.format(draftRatio)} des factures clients sont en brouillon (non émises)`
    );
  }
  for (const a of anomalies.filter((x) => x.kind === 'vanish').slice(0, 2)) {
    actions.push(`Saisir / vérifier la charge **${a.number} ${a.label || ''}** manquante sur la période`);
  }
  for (const d of dupes.slice(0, 2)) {
    actions.push(`Vérifier le **doublon ${d.supplierName}** (${d.count} factures de ${EUR.format(d.amount)})`);
  }
  if (overdue.critical > 0) {
    actions.push(
      `Relancer les **${overdue.critical} factures de plus de 60 jours de retard** (${overdue.top3[0]?.[0] || ''} en tête)`
    );
  }
  for (const a of anomalies.filter((x) => x.kind === 'spike').slice(0, 2)) {
    actions.push(`Investiguer le **pic de charge ${a.number} ${a.label || ''}** (${EUR.format(a.absDiff)} d'écart)`);
  }
  return actions.slice(0, 5);
}

function composeMarkdown({ tone, me, period, revenue, charges, overdue, anomalies, dupes, draftRatio, todayIso }) {
  const result = revenue.total - charges.total;
  const margin = revenue.total > 0 ? result / revenue.total : null;
  const lines = [];

  // En-tête
  lines.push(`# Note de synthèse mensuelle — ${me.company.name}`);
  lines.push(`**Période : ${period.curr.label}** · Génération automatique le ${todayIso}`);
  lines.push('');

  // Avertissement si la période n'a aucune donnée comptabilisée
  // (ni revenus émis, ni charges enregistrées dans le grand livre)
  if (revenue.count === 0 && charges.total === 0) {
    lines.push(
      `⚠️ **Aucune donnée comptabilisée pour ${period.curr.label}.** Vérifie la période demandée (mois futur ?) ou attends la clôture du mois. La trésorerie clients ci-dessous reflète l'état actuel global du dossier, pas le mois interrogé.`
    );
    lines.push('');
  }

  // Section "En 3 lignes" — TOUS LES TONS l'ont
  lines.push('## Synthèse en 3 chiffres');
  lines.push(`- **CA HT : ${EUR.format(revenue.total)}** (${revenue.count} factures)`);
  lines.push(`- **Résultat brut : ${EUR.format(result)}**${margin !== null ? ` · marge ${PCT.format(margin)}` : ''}`);
  lines.push(`- **${EUR.format(overdue.totalTtc)} dûs par les clients** (${overdue.count} factures en retard)`);
  lines.push('');

  // Tone "concise" : on saute le détail P&L et trésorerie
  const includeDetailSections = tone !== 'concise';

  if (includeDetailSections) {
    lines.push('## Compte de résultat');
    lines.push(`- Revenus : ${EUR.format(revenue.total)} (${revenue.count} factures émises)`);
    lines.push(`- Achats matières (60) : ${EUR.format(charges.achats)}`);
    lines.push(`- Services extérieurs (61-62) : ${EUR.format(charges.services)}`);
    lines.push(`- Impôts et taxes (63) : ${EUR.format(charges.impots)}`);
    lines.push(`- Charges de personnel (64) : ${EUR.format(charges.personnel)}`);
    lines.push(`- Autres charges (65+) : ${EUR.format(charges.autres)}`);
    const resFlag = result < 0 ? ' 🔴' : '';
    lines.push(`- **Résultat : ${EUR.format(result)}**${resFlag}${margin !== null ? ` · marge ${PCT.format(margin)}` : ''}`);
    lines.push('');

    lines.push('## Trésorerie clients');
    lines.push(`- ${overdue.count} factures en retard pour **${EUR.format(overdue.totalTtc)} TTC**`);
    if (overdue.critical > 0) {
      lines.push(`- 🔴 ${overdue.critical} facture${overdue.critical > 1 ? 's' : ''} avec plus de 60 jours de retard`);
    }
    if (overdue.oldest > 0) {
      lines.push(`- Plus ancienne : ${overdue.oldest} jours de retard`);
    }
    if (overdue.top3.length > 0) {
      lines.push(`- Top 3 clients : ${overdue.top3.map(([n, i]) => `**${n}** (${EUR.format(i.total)})`).join(', ')}`);
    }
    lines.push('');
  }

  // Top 5 dépenses anormales
  lines.push(`## Top 5 dépenses anormales (vs moyenne ${period.m3.label}–${period.m1.label})`);
  if (anomalies.length === 0) {
    lines.push('_Aucune variation significative détectée._');
  } else {
    for (const a of anomalies) {
      lines.push(`- ${fmtAnomaly(a)}`);
      if (tone === 'detailed') {
        if (a.kind === 'vanish') {
          lines.push(`  → Vérifier si la facture/écriture du mois a été oubliée (cut-off comptable).`);
        } else if (a.kind === 'spike') {
          lines.push(`  → Vérifier l'origine du pic : doublon, erreur de saisie, ou évènement réel à documenter.`);
        }
      }
    }
  }
  lines.push('');

  // Anomalies (doublons)
  if (dupes.length > 0) {
    lines.push('## Doublons fournisseurs détectés');
    for (const d of dupes) {
      lines.push(`- ⚠️ **${d.supplierName}** : ${d.count} factures de ${EUR.format(d.amount)} sur le mois (refs ${d.refs.join(', ')})`);
    }
    lines.push('');
  }

  // Avertissement fiabilité
  if (draftRatio > 0.5) {
    lines.push('## ⚠️ Avertissement fiabilité');
    lines.push(
      `${PCT.format(draftRatio)} des factures clients de la période sont en mode brouillon (non émises). Les indicateurs de revenus et de marge ci-dessus ne sont pas exploitables tant que le process de facturation n'est pas repris.`
    );
    lines.push('');
  }

  // Actions
  const actions = buildActions({ anomalies, dupes, overdue, draftRatio });
  if (actions.length > 0) {
    lines.push(`## Actions cabinet recommandées`);
    let i = 1;
    const prefix = tone === 'alerting' ? '**À RÉGLER**' : '';
    for (const a of actions) {
      lines.push(`${i}. ${prefix ? prefix + ' — ' : ''}${a}`);
      i++;
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(
    `_Source : Pennylane, dossier ${me.company.name} (${me.company.reg_no}). Période : ${period.curr.start} au ${period.curr.end}. Génération automatique le ${todayIso}. Revenus calculés sur factures émises (incluant brouillons en v0.1)._`
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entrée publique du playbook
// ---------------------------------------------------------------------------

export async function buildMonthlyClose({ month, tone = 'neutral' }) {
  const validTones = ['neutral', 'alerting', 'concise', 'detailed'];
  if (!validTones.includes(tone)) {
    throw new Error(`Tone invalide : "${tone}". Valeurs acceptées : ${validTones.join(', ')}.`);
  }

  const period = parseMonth(month);
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // Lancement de tous les fetches en parallèle
  const [
    me,
    class6Curr,
    class6M1,
    class6M2,
    class6M3,
    customerInvoices,
    supplierInvoices,
    customerNames,
    supplierNames,
  ] = await Promise.all([
    pnlFetch('/me'),
    fetchClass6Charges(period.curr.start, period.curr.end),
    fetchClass6Charges(period.m1.start, period.m1.end),
    fetchClass6Charges(period.m2.start, period.m2.end),
    fetchClass6Charges(period.m3.start, period.m3.end),
    fetchAllCustomerInvoices(),
    fetchAllSupplierInvoices(),
    fetchCustomerNames(),
    fetchSupplierNames(),
  ]);

  const charges = aggregateChargesBuckets(class6Curr);
  const revenue = sumRevenueInPeriod(customerInvoices, period.curr.start, period.curr.end);
  const overdue = summarizeOverdueInvoices(customerInvoices, customerNames, today);
  const anomalies = detectAnomalousExpenses(class6Curr, [class6M1, class6M2, class6M3]);
  const dupes = detectDuplicateSupplierInvoices(supplierInvoices, period.curr, supplierNames);

  // Ratio de drafts dans les revenus de la période
  const periodInvoices = customerInvoices.filter(
    (i) => i.date >= period.curr.start && i.date <= period.curr.end
  );
  const draftCount = periodInvoices.filter((i) => i.draft === true).length;
  const draftRatio = periodInvoices.length > 0 ? draftCount / periodInvoices.length : 0;

  return composeMarkdown({
    tone,
    me,
    period,
    revenue,
    charges,
    overdue,
    anomalies,
    dupes,
    draftRatio,
    todayIso,
  });
}
