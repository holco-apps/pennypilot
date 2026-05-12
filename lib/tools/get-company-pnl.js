// Tool : get_company_pnl
// Compte de résultat synthétique pour un mois, trimestre ou année.
// Approche v0.1 (Option A) : revenus = somme customer_invoices émises (incluant drafts),
// charges = trial_balance classe 6 du grand livre. Comparatif vs période précédente,
// anomalies signalées (marge < 10%, résultat négatif, variations > 30%).

import { pnlFetch, paginateAll } from '../pennylane-client.js';
import { parsePeriod } from '../period.js';
import { requestContextIfMissing } from '../context-guard.js';

export const getCompanyPnlSchema = {
  name: 'get_company_pnl',
  description: `Compte de résultat synthétique d'une entreprise pour un mois, un trimestre ou une année. CA, charges en grandes masses, résultat brut + marge, comparatif vs période précédente, anomalies.

⚠️ **AVANT** de lancer ce tool tu DOIS avoir établi le contexte du dossier (activité, secteur, saisonnalité, particularités). Le tool auto-détecte le SIREN + activité NAF depuis l'open data, mais il refusera de produire l'analyse tant que l'utilisateur n'a pas confirmé/complété le contexte (1 phrase suffit). Transmets ce contexte via le paramètre \`dossier_context\`.

À utiliser quand l'utilisateur demande :
- "Donne-moi le P&L d'avril 2026"
- "Compte de résultat du dossier"
- "Quelle a été la marge brute sur le T1 ?"

Ne PAS utiliser pour :
- Les factures impayées (utiliser find_unpaid_customer_invoices)
- Le détail compte par compte (utiliser get_chart_of_accounts ou browse_account_ledger)
- Bilan / trésorerie (futur tool v0.3)`,
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: 'Période : "2026-04" (mois), "2026-Q1" (trimestre), "2026" (année). Défaut : mois précédent.',
      },
      dossier_context: {
        type: 'string',
        description:
          "Contexte cabinet du dossier établi avec l'utilisateur (1-3 phrases) : confirmation activité + saisonnalité de la période + particularités connues. REQUIS pour lancer l'analyse — si absent ou trop vague, le tool retournera l'auto-détection SIREN/NAF + une question de confirmation à poser à l'user.",
      },
    },
  },
};

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const PCT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 });

async function fetchAllCustomerInvoices() {
  return paginateAll('/customer_invoices');
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

async function fetchTrialBalanceCharges(start, end) {
  // Charges = classe 6. Solde net = debits - credits (positif = charge).
  const all = await paginateAll(`/trial_balance?period_start=${start}&period_end=${end}`);

  const breakdown = {
    achats: 0, // 60
    services: 0, // 61, 62
    impots: 0, // 63
    personnel: 0, // 64
    autres: 0, // 65+ et autres classes 6
  };

  for (const acc of all) {
    const num = String(acc.number || '');
    if (!num.startsWith('6')) continue;
    const d = Number(acc.debits || 0);
    const c = Number(acc.credits || 0);
    const charge = d - c; // positif = charge

    if (num.startsWith('60')) breakdown.achats += charge;
    else if (num.startsWith('61') || num.startsWith('62')) breakdown.services += charge;
    else if (num.startsWith('63')) breakdown.impots += charge;
    else if (num.startsWith('64')) breakdown.personnel += charge;
    else breakdown.autres += charge;
  }

  return {
    ...breakdown,
    total: Object.values(breakdown).reduce((s, v) => s + v, 0),
  };
}

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

function variation(curr, prev) {
  if (prev === 0 && curr === 0) return { abs: 0, pct: null, text: '=' };
  if (prev === 0) return { abs: curr, pct: null, text: 'nouveau' };
  const abs = curr - prev;
  const pct = abs / Math.abs(prev);
  const sign = abs > 0 ? '+' : '';
  return {
    abs,
    pct,
    text: `${sign}${PCT.format(pct)}`,
    isMajor: Math.abs(pct) > 0.30,
  };
}

function fmtLine(label, curr, prev, suffix = '') {
  const v = variation(curr, prev);
  const flag = v.isMajor ? ' ⚠️' : '';
  return `- ${label} : **${EUR.format(curr)}** (vs ${EUR.format(prev)} → ${v.text})${flag}${suffix}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function getCompanyPnl(args = {}) {
  const period = parsePeriod(args.period);

  // Guard contexte : refuser de produire un P&L sans contexte établi
  const contextPrompt = await requestContextIfMissing(args.dossier_context, {
    analysisName: 'le compte de résultat',
    period: `la période ${period.label || ''}`.trim(),
  });
  if (contextPrompt) return contextPrompt;

  const [allInvoices, chargesCurr, chargesPrev, me] = await Promise.all([
    fetchAllCustomerInvoices(),
    fetchTrialBalanceCharges(period.start, period.end),
    fetchTrialBalanceCharges(period.prevStart, period.prevEnd),
    pnlFetch('/me'),
  ]);

  const revenueCurr = sumRevenueInPeriod(allInvoices, period.start, period.end);
  const revenuePrev = sumRevenueInPeriod(allInvoices, period.prevStart, period.prevEnd);

  const resultCurr = revenueCurr.total - chargesCurr.total;
  const resultPrev = revenuePrev.total - chargesPrev.total;
  const marginCurr = revenueCurr.total > 0 ? resultCurr / revenueCurr.total : null;
  const marginPrev = revenuePrev.total > 0 ? resultPrev / revenuePrev.total : null;

  // Anomalies
  const anomalies = [];
  if (resultCurr < 0) anomalies.push('🔴 Résultat négatif sur la période');
  if (marginCurr !== null && marginCurr < 0.10 && marginCurr >= 0) {
    anomalies.push(`🟡 Marge < 10% (${PCT.format(marginCurr)})`);
  }
  for (const [label, key] of [
    ['Achats', 'achats'],
    ['Services extérieurs', 'services'],
    ['Impôts et taxes', 'impots'],
    ['Personnel', 'personnel'],
    ['Autres charges', 'autres'],
  ]) {
    const v = variation(chargesCurr[key], chargesPrev[key]);
    if (v.isMajor && Math.abs(chargesCurr[key]) > 100) {
      anomalies.push(`⚠️ ${label} : ${v.text} vs ${period.prevLabel} (${EUR.format(chargesCurr[key] - chargesPrev[key])} d'écart)`);
    }
  }

  // Composition du markdown
  const lines = [];
  lines.push(`**Compte de résultat — ${me.company.name}**`);
  lines.push('');
  lines.push(`Période : ${period.label} (${period.start} au ${period.end})`);
  lines.push(`Comparaison : ${period.prevLabel}`);
  lines.push('');

  lines.push('**REVENUS**');
  const revVar = variation(revenueCurr.total, revenuePrev.total);
  lines.push(
    `- Chiffre d'affaires HT : **${EUR.format(revenueCurr.total)}** (${revenueCurr.count} factures, vs ${EUR.format(revenuePrev.total)} en ${period.prevLabel} → ${revVar.text})`
  );
  lines.push('');

  lines.push('**CHARGES** (issues du grand livre)');
  lines.push(fmtLine('Achats matières et marchandises (60)', chargesCurr.achats, chargesPrev.achats));
  lines.push(fmtLine('Services extérieurs (61-62)', chargesCurr.services, chargesPrev.services));
  lines.push(fmtLine('Impôts et taxes (63)', chargesCurr.impots, chargesPrev.impots));
  lines.push(fmtLine('Charges de personnel (64)', chargesCurr.personnel, chargesPrev.personnel));
  lines.push(fmtLine('Autres charges (65+)', chargesCurr.autres, chargesPrev.autres));
  lines.push(fmtLine('**Total charges**', chargesCurr.total, chargesPrev.total));
  lines.push('');

  lines.push('**RÉSULTAT**');
  const resVar = variation(resultCurr, resultPrev);
  const resFlag = resultCurr < 0 ? ' 🔴' : '';
  lines.push(
    `- Résultat brut : **${EUR.format(resultCurr)}**${resFlag} (vs ${EUR.format(resultPrev)} → ${resVar.text})`
  );
  if (marginCurr !== null) {
    const marginFlag = marginCurr < 0 ? ' 🔴' : marginCurr < 0.10 ? ' 🟡' : '';
    const marginPrevText =
      marginPrev !== null ? ` (vs ${PCT.format(marginPrev)} en ${period.prevLabel})` : '';
    lines.push(`- Marge brute : **${PCT.format(marginCurr)}**${marginFlag}${marginPrevText}`);
  }
  lines.push('');

  if (anomalies.length > 0) {
    lines.push('**Anomalies détectées :**');
    for (const a of anomalies) lines.push(`- ${a}`);
    lines.push('');
  }

  lines.push(
    `_Source : Pennylane, dossier ${me.company.name} (${me.company.reg_no}). Revenus = somme customer_invoices émises sur la période (incluant brouillons en v0.1). Charges = soldes nets des comptes de classe 6 du grand livre._`
  );

  return lines.join('\n');
}
