// Playbook : Pré-révision (revision triage)
// Compose plusieurs endpoints Pennylane read-only pour produire une checklist
// pré-révision en 5 sections obligatoires (Synthèse / Blockers par cycle /
// Demandes client / Commentaires / Audit trail) avec séparation stricte
// faits / calculs / hypothèses / limites / recommandations.
//
// Strictly read-only. No write side effects on Pennylane.

import { pnlFetch, paginate, paginateAll } from '../pennylane-client.js';
import { parsePeriod } from '../period.js';

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const DAY_MS = 24 * 60 * 60 * 1000;

function asNum(x) { return Number(x ?? 0); }
function pct(a, b) { return b === 0 ? null : (a - b) / Math.abs(b); }
function clip(s, n = 80) { return String(s ?? '').replace(/\s+/g, ' ').slice(0, n); }
function escapeMd(s) { return String(s ?? '').replace(/([\\`*_{}\[\]()#+\-.!|])/g, '\\$1'); }

// ---------------------------------------------------------------------------
// Fetchers (réutilisent les composants existants)
// ---------------------------------------------------------------------------

async function fetchTrialBalance(start, end) {
  try {
    return await paginateAll(`/trial_balance?period_start=${start}&period_end=${end}`);
  } catch (err) {
    return { __error: `trial_balance ${start}→${end} indisponible : ${err.message}` };
  }
}

async function fetchAllInvoices(path) {
  try {
    return await paginateAll(path);
  } catch (err) {
    return { __error: `${path} indisponible : ${err.message}` };
  }
}

async function fetchUnlettered(prefix) {
  const q = new URLSearchParams({
    lettering_state: 'unlettered',
    ledger_account_number_prefix: prefix,
  });
  try {
    return await paginateAll(`/ledger_entry_lines?${q}`);
  } catch (err) {
    return { __error: `ledger_entry_lines prefix=${prefix} indisponible : ${err.message}` };
  }
}

async function fetchPartyMap(endpoint) {
  const map = new Map();
  try {
    for await (const p of paginate(endpoint)) map.set(p.id, p.name || p.label || `id=${p.id}`);
  } catch (err) {
    return { __error: `${endpoint} indisponible : ${err.message}` };
  }
  return map;
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

function aggregateUnlettered(lines, threshold) {
  if (!Array.isArray(lines)) return { byAccount: [], total: 0, count: 0, oldest: null };
  const byAccount = new Map();
  let total = 0;
  let oldest = null;
  for (const l of lines) {
    const num = l.ledger_account_number || l.account_number || '???';
    const label = l.ledger_account_label || l.account_label || '';
    const debit = asNum(l.debit ?? l.amount_debit);
    const credit = asNum(l.credit ?? l.amount_credit);
    const net = debit - credit;
    const d = (l.entry_date || l.date || '').slice(0, 10);
    const key = `${num}|${label}`;
    if (!byAccount.has(key)) byAccount.set(key, { num, label, net: 0, count: 0, oldest: null });
    const agg = byAccount.get(key);
    agg.net += net;
    agg.count++;
    if (!agg.oldest || (d && d < agg.oldest)) agg.oldest = d;
    total += Math.abs(net);
    if (!oldest || (d && d < oldest)) oldest = d;
  }
  const sorted = [...byAccount.values()]
    .filter((a) => Math.abs(a.net) >= threshold)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return { byAccount: sorted, total, count: lines.length, oldest };
}

function aggregateUnpaidInvoices(invoices, sense, threshold) {
  // sense = 'customer' | 'supplier'
  if (!Array.isArray(invoices)) return { items: [], total: 0, count: 0 };
  const now = Date.now();
  const items = [];
  let total = 0;
  for (const inv of invoices) {
    if (inv.paid || inv.status === 'paid') continue;
    const due = inv.deadline || inv.due_date || inv.payment_date;
    if (!due) continue;
    const dueMs = new Date(due).getTime();
    if (!Number.isFinite(dueMs) || dueMs >= now) continue;
    const amount = asNum(inv.amount ?? inv.total_amount ?? inv.amount_ttc ?? inv.gross_amount);
    if (Math.abs(amount) < threshold) continue;
    const daysOverdue = Math.floor((now - dueMs) / DAY_MS);
    items.push({
      id: inv.id,
      partyId: sense === 'customer' ? inv.customer_id : inv.supplier_id,
      ref: inv.reference || inv.invoice_number || `#${inv.id}`,
      amount,
      due: due.slice(0, 10),
      daysOverdue,
    });
    total += Math.abs(amount);
  }
  items.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return { items, total, count: items.length };
}

function detectDuplicateSupplierInvoices(invoices, partyMap) {
  if (!Array.isArray(invoices) || !(partyMap instanceof Map)) return [];
  const buckets = new Map();
  for (const inv of invoices) {
    const supplierId = inv.supplier_id ?? inv.partner_id ?? null;
    const amount = asNum(inv.amount ?? inv.total_amount ?? inv.amount_ttc ?? inv.gross_amount);
    const date = (inv.invoice_date || inv.date || inv.created_at || '').slice(0, 10);
    if (!supplierId || !amount || !date) continue;
    const key = `${supplierId}|${amount.toFixed(2)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ id: inv.id, ref: inv.reference || inv.invoice_number || `#${inv.id}`, date, amount, supplierId });
  }
  const dups = [];
  for (const items of buckets.values()) {
    if (items.length < 2) continue;
    const supplierName = partyMap.get(items[0].supplierId) || `id=${items[0].supplierId}`;
    dups.push({ supplierName, supplierId: items[0].supplierId, amount: items[0].amount, items });
  }
  return dups.sort((a, b) => b.amount * b.items.length - a.amount * a.items.length);
}

function detectChargeAnomalies(trialBalance, trialBalancePrev) {
  // Cherche compte 6* avec variation > 30% vs N-1 ou disparu.
  if (!Array.isArray(trialBalance) || !Array.isArray(trialBalancePrev)) return [];
  const prevMap = new Map();
  for (const a of trialBalancePrev) {
    const num = a.account_number || a.number || '';
    if (num.startsWith('6')) prevMap.set(num, asNum(a.debit ?? a.amount_debit) - asNum(a.credit ?? a.amount_credit));
  }
  const anomalies = [];
  for (const a of trialBalance) {
    const num = a.account_number || a.number || '';
    if (!num.startsWith('6')) continue;
    const net = asNum(a.debit ?? a.amount_debit) - asNum(a.credit ?? a.amount_credit);
    const prev = prevMap.get(num);
    if (prev === undefined) continue;
    const variation = pct(net, prev);
    if (variation === null) continue;
    if (Math.abs(variation) >= 0.30 && Math.abs(net - prev) >= 1000) {
      anomalies.push({
        num,
        label: a.account_label || a.label || '',
        current: net,
        previous: prev,
        variation,
      });
    }
  }
  // Charges récurrentes disparues : présentes N-1, absentes N
  const currentNums = new Set(trialBalance.map((a) => a.account_number || a.number || ''));
  for (const [num, prev] of prevMap) {
    if (!currentNums.has(num) && Math.abs(prev) >= 1000) {
      anomalies.push({ num, label: '(absent N)', current: 0, previous: prev, variation: -1 });
    }
  }
  return anomalies.sort((a, b) => Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous)).slice(0, 10);
}

function detectRevenueSignals(trialBalance, trialBalancePrev) {
  // Compte 7* : variations significatives
  if (!Array.isArray(trialBalance) || !Array.isArray(trialBalancePrev)) return [];
  const prevMap = new Map();
  for (const a of trialBalancePrev) {
    const num = a.account_number || a.number || '';
    if (num.startsWith('7')) prevMap.set(num, asNum(a.credit ?? a.amount_credit) - asNum(a.debit ?? a.amount_debit));
  }
  const signals = [];
  for (const a of trialBalance) {
    const num = a.account_number || a.number || '';
    if (!num.startsWith('7')) continue;
    const net = asNum(a.credit ?? a.amount_credit) - asNum(a.debit ?? a.amount_debit);
    const prev = prevMap.get(num);
    if (prev === undefined) continue;
    const variation = pct(net, prev);
    if (variation === null) continue;
    if (Math.abs(variation) >= 0.40 && Math.abs(net - prev) >= 2000) {
      signals.push({
        num,
        label: a.account_label || a.label || '',
        current: net,
        previous: prev,
        variation,
      });
    }
  }
  return signals.sort((a, b) => Math.abs(b.variation) - Math.abs(a.variation)).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

function computeReadiness({ c411, c401, unpaidC, unpaidS, chargeAnomalies, duplicates }) {
  let score = 0;
  if (c411.byAccount.length >= 3) score += 2;
  if (c411.byAccount.length >= 8) score += 2;
  if (c401.byAccount.length >= 3) score += 1;
  if (unpaidC.items.some((i) => i.daysOverdue > 60)) score += 2;
  if (chargeAnomalies.length >= 3) score += 2;
  if (duplicates.length >= 1) score += 2;
  if (unpaidS.items.length >= 5) score += 1;
  if (score >= 7) return 'Bloquant';
  if (score >= 3) return 'À revoir';
  return 'Prêt';
}

// ---------------------------------------------------------------------------
// Output sections
// ---------------------------------------------------------------------------

function section1Synthese({ readiness, period, prev, focus, blockers }) {
  const lines = [];
  lines.push(`# Pré-révision — ${period.label}`);
  lines.push('');
  lines.push(`**État** : ${readiness === 'Prêt' ? '🟢 Prêt' : readiness === 'À revoir' ? '🟡 À revoir' : '🔴 Bloquant'}`);
  lines.push(`Comparatif : ${prev.label}`);
  lines.push('');
  lines.push('## 1. Synthèse d’urgence');
  lines.push('');
  if (blockers.length === 0) {
    lines.push('_Aucun blocker majeur détecté sur cette période._');
  } else {
    lines.push('Top blockers (matérialité × ancienneté) :');
    lines.push('');
    blockers.forEach((b, i) => {
      lines.push(`${i + 1}. **${escapeMd(b.title)}** — ${EUR.format(b.amount)}${b.detail ? ` · ${escapeMd(b.detail)}` : ''}`);
    });
  }
  if (focus.length) {
    lines.push('');
    lines.push('Focus suggéré : ' + focus.map((f) => `\`${f}\``).join(' · '));
  }
  return lines.join('\n');
}

function section2Cycles({ c411, c401, unpaidC, unpaidS, duplicates, chargeAnomalies, revenueSignals, fetchErrors }) {
  const out = ['', '## 2. Points bloquants par cycle', ''];

  out.push('### Clients / 411');
  if (unpaidC.count === 0 && c411.byAccount.length === 0) {
    out.push('- Aucun blocker détecté.');
  } else {
    if (unpaidC.count) out.push(`- **${unpaidC.count} factures clients impayées** dépassant le seuil, total ${EUR.format(unpaidC.total)}.`);
    if (c411.byAccount.length) out.push(`- **${c411.byAccount.length} comptes 411 avec écritures non lettrées** (au-dessus du seuil), solde net ${EUR.format(c411.byAccount.reduce((s, a) => s + a.net, 0))}.`);
    const over60 = unpaidC.items.filter((i) => i.daysOverdue > 60);
    if (over60.length) out.push(`- ⚠️ **${over60.length} factures > 60 jours de retard** — provision à envisager.`);
  }

  out.push('');
  out.push('### Fournisseurs / 401');
  if (unpaidS.count === 0 && c401.byAccount.length === 0 && duplicates.length === 0) {
    out.push('- Aucun blocker détecté.');
  } else {
    if (unpaidS.count) out.push(`- **${unpaidS.count} factures fournisseurs impayées** dépassant le seuil, total ${EUR.format(unpaidS.total)}.`);
    if (c401.byAccount.length) out.push(`- **${c401.byAccount.length} comptes 401 avec écritures non lettrées**, solde net ${EUR.format(c401.byAccount.reduce((s, a) => s + a.net, 0))}.`);
    if (duplicates.length) {
      out.push(`- ⚠️ **${duplicates.length} doublon(s) potentiel(s)** (même fournisseur, même montant) :`);
      duplicates.slice(0, 3).forEach((d) => {
        out.push(`  - ${escapeMd(d.supplierName)} · ${EUR.format(d.amount)} · ${d.items.length} occurrences (${d.items.map((i) => i.ref).slice(0, 3).join(', ')})`);
      });
    }
  }

  out.push('');
  out.push('### Banque / 512');
  out.push('- _Lecture banque limitée_ : le scope `transactions:readonly` n’est pas activé sur ce dossier. Section enrichie en v0.3 si le scope est ouvert.');

  out.push('');
  out.push('### Charges / 6');
  if (chargeAnomalies.length === 0) {
    out.push('- Aucune variation significative vs période précédente.');
  } else {
    chargeAnomalies.forEach((a) => {
      const v = a.variation === -1 ? 'absent' : `${a.variation >= 0 ? '+' : ''}${(a.variation * 100).toFixed(0)}%`;
      out.push(`- \`${a.num}\` ${escapeMd(clip(a.label, 50))} — ${EUR.format(a.current)} vs ${EUR.format(a.previous)} (${v})`);
    });
  }

  out.push('');
  out.push('### Produits / 7');
  if (revenueSignals.length === 0) {
    out.push('- Aucune variation significative vs période précédente.');
  } else {
    revenueSignals.forEach((s) => {
      const v = `${s.variation >= 0 ? '+' : ''}${(s.variation * 100).toFixed(0)}%`;
      out.push(`- \`${s.num}\` ${escapeMd(clip(s.label, 50))} — ${EUR.format(s.current)} vs ${EUR.format(s.previous)} (${v})`);
    });
  }

  out.push('');
  out.push('### Paie 64 / Taxes 63 / Immo 2 / Emprunts 16');
  out.push('- _v0.2.9 — flag balance uniquement, détail prévu en v0.3._');

  if (fetchErrors.length) {
    out.push('');
    out.push('### ⚠️ Endpoints partiellement indisponibles');
    fetchErrors.forEach((e) => out.push(`- ${escapeMd(e)}`));
  }

  return out.join('\n');
}

function section3Demandes({ unpaidC, duplicates, chargeAnomalies, customerMap, includeRequests }) {
  if (!includeRequests) return '';
  const out = ['', '## 3. Demandes client préparées', '', '_Drafts à copier dans Pennylane → Demandes au client. Non envoyés._', ''];

  const requests = [];

  const over60 = unpaidC.items.filter((i) => i.daysOverdue > 60).slice(0, 5);
  if (over60.length) {
    const lines = over60.map((i) => {
      const name = customerMap?.get(i.partyId) || `client #${i.partyId ?? '?'}`;
      return `  - ${escapeMd(name)} · facture ${escapeMd(i.ref)} · ${EUR.format(i.amount)} · ${i.daysOverdue} jours de retard`;
    });
    requests.push(['Relance impayés > 60 jours', `Pouvez-vous confirmer où en sont ces règlements (encaissement attendu, litige, plan de paiement) ?\n${lines.join('\n')}`]);
  }

  if (duplicates.length) {
    const lines = duplicates.slice(0, 3).map((d) => `  - ${escapeMd(d.supplierName)} · ${EUR.format(d.amount)} · ${d.items.length} factures (${d.items.map((i) => i.ref).join(', ')})`);
    requests.push(['Doublons fournisseurs', `Merci de vérifier si ces factures sont bien distinctes (livraisons différentes, acomptes) ou si un doublon de saisie s’est glissé :\n${lines.join('\n')}`]);
  }

  if (chargeAnomalies.length) {
    const lines = chargeAnomalies.slice(0, 3).map((a) => {
      const v = a.variation === -1 ? 'absent' : `${a.variation >= 0 ? '+' : ''}${(a.variation * 100).toFixed(0)}%`;
      return `  - \`${a.num}\` ${escapeMd(clip(a.label, 50))} — ${EUR.format(a.current)} vs ${EUR.format(a.previous)} (${v})`;
    });
    requests.push(['Variations de charges', `Pouvez-vous expliquer les écarts ci-dessous (changement de prestataire, ponctuel, oubli de saisie) ?\n${lines.join('\n')}`]);
  }

  if (requests.length === 0) {
    out.push('- Aucune demande client à préparer sur cette période.');
  } else {
    requests.forEach(([title, body]) => {
      out.push(`### ${title}`);
      out.push('');
      out.push(body);
      out.push('');
    });
  }

  return out.join('\n');
}

function section4Comments({ readiness, period, c411, c401, unpaidC }) {
  const out = ['', '## 4. Commentaires de révision pré-rédigés', '', '_DRAFT — à valider par le cabinet._', ''];

  out.push(`### Synthèse ${escapeMd(period.label)}`);
  out.push(`État global : **${readiness}**. Les soldes auxiliaires 411/401 affichent respectivement ${c411.byAccount.length} comptes et ${c401.byAccount.length} comptes au-dessus du seuil de matérialité avec écritures non lettrées. Les factures clients impayées identifiées au-dessus du seuil totalisent ${EUR.format(unpaidC.total)}.`);
  out.push('');
  out.push('### Limites de ce commentaire');
  out.push('- Source : Pennylane Company API v2, lecture seule.');
  out.push('- Lecture banque non disponible sur ce dossier (scope `transactions:readonly` non activé).');
  out.push('- Variations N-1 calculées en débit-crédit brut, sans retraitement TVA encaissement / multi-établissements.');
  out.push('');

  return out.join('\n');
}

function section5AuditTrail({ endpoints, facts, calculations, assumptions, limits, recommendations, period }) {
  const out = ['', '## 5. Audit trail / vérification', ''];

  out.push('### Endpoints Pennylane consultés');
  endpoints.forEach((e) => out.push(`- \`GET ${e.path}\` — ${e.count} ${e.unit}`));

  out.push('');
  out.push('### Séparation faits / calculs / hypothèses / limites / recommandations');

  out.push('');
  out.push('**Faits Pennylane (bruts)** :');
  facts.forEach((f) => out.push(`- ${f}`));

  out.push('');
  out.push('**Calculs déterministes appliqués** :');
  calculations.forEach((c) => out.push(`- ${c}`));

  out.push('');
  out.push('**Hypothèses (paramètres et valeurs par défaut)** :');
  assumptions.forEach((a) => out.push(`- ${a}`));

  out.push('');
  out.push('**Limites connues** :');
  limits.forEach((l) => out.push(`- ${l}`));

  out.push('');
  out.push('**Recommandations produites** :');
  recommendations.forEach((r) => out.push(`- ${r}`));

  out.push('');
  out.push('---');
  out.push(`Période analysée : ${period.start} → ${period.end} (vs ${period.prevStart} → ${period.prevEnd}).`);
  out.push('**À valider par le cabinet. Aucune modification effectuée sur Pennylane.**');

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Entrée principale
// ---------------------------------------------------------------------------

export async function runRevisionTriage(args = {}) {
  const period = parsePeriod(args.period);
  const scope = args.scope || 'monthly_review';
  const threshold = Number.isFinite(Number(args.materiality_threshold_eur)) ? Number(args.materiality_threshold_eur) : 100;
  const includeRequests = args.include_client_requests !== false;

  // Fetch parallèle
  const [
    tb, tbPrev,
    customerInvoices, supplierInvoices,
    customerMap, supplierMap,
    lines411, lines401,
  ] = await Promise.all([
    fetchTrialBalance(period.start, period.end),
    fetchTrialBalance(period.prevStart, period.prevEnd),
    fetchAllInvoices('/customer_invoices'),
    fetchAllInvoices('/supplier_invoices'),
    fetchPartyMap('/customers'),
    fetchPartyMap('/suppliers'),
    fetchUnlettered('411'),
    fetchUnlettered('401'),
  ]);

  const fetchErrors = [];
  const collect = (label, x) => { if (x && x.__error) { fetchErrors.push(`${label} → ${x.__error}`); return []; } return x; };

  const tbArr = collect('trial_balance N', tb);
  const tbPrevArr = collect('trial_balance N-1', tbPrev);
  const ciArr = collect('customer_invoices', customerInvoices);
  const siArr = collect('supplier_invoices', supplierInvoices);
  const cmap = customerMap?.__error ? new Map() : customerMap;
  const smap = supplierMap?.__error ? new Map() : supplierMap;
  if (customerMap?.__error) fetchErrors.push(`customers → ${customerMap.__error}`);
  if (supplierMap?.__error) fetchErrors.push(`suppliers → ${supplierMap.__error}`);
  const lines411Arr = collect('ledger_entry_lines 411', lines411);
  const lines401Arr = collect('ledger_entry_lines 401', lines401);

  // Aggregations
  const c411 = aggregateUnlettered(lines411Arr, threshold);
  const c401 = aggregateUnlettered(lines401Arr, threshold);
  const unpaidC = aggregateUnpaidInvoices(ciArr, 'customer', threshold);
  const unpaidS = aggregateUnpaidInvoices(siArr, 'supplier', threshold);
  const duplicates = detectDuplicateSupplierInvoices(siArr, smap);
  const chargeAnomalies = detectChargeAnomalies(tbArr, tbPrevArr);
  const revenueSignals = detectRevenueSignals(tbArr, tbPrevArr);

  // Blockers top 5
  const blockers = [];
  c411.byAccount.slice(0, 2).forEach((a) => blockers.push({ title: `Lettrage 411 ${a.num}`, amount: Math.abs(a.net), detail: clip(a.label, 50) }));
  unpaidC.items.slice(0, 2).forEach((i) => {
    const name = cmap?.get(i.partyId) || `client #${i.partyId ?? '?'}`;
    blockers.push({ title: `Impayé ${name}`, amount: Math.abs(i.amount), detail: `${i.daysOverdue}j de retard` });
  });
  if (duplicates[0]) blockers.push({ title: `Doublons fournisseur ${duplicates[0].supplierName}`, amount: duplicates[0].amount * duplicates[0].items.length, detail: `${duplicates[0].items.length} occurrences` });
  blockers.sort((a, b) => b.amount - a.amount).splice(5);

  // Focus
  const focus = [];
  if (c411.byAccount.length || unpaidC.count) focus.push('411 / Clients');
  if (c401.byAccount.length || duplicates.length) focus.push('401 / Fournisseurs');
  if (chargeAnomalies.length) focus.push('6 / Charges');
  if (revenueSignals.length) focus.push('7 / Produits');

  const readiness = computeReadiness({ c411, c401, unpaidC, unpaidS, chargeAnomalies, duplicates });

  // Audit trail data
  const endpoints = [
    { path: `/trial_balance?period_start=${period.start}&period_end=${period.end}`, count: tbArr.length, unit: 'lignes' },
    { path: `/trial_balance?period_start=${period.prevStart}&period_end=${period.prevEnd}`, count: tbPrevArr.length, unit: 'lignes (N-1)' },
    { path: '/customer_invoices', count: ciArr.length, unit: 'factures' },
    { path: '/supplier_invoices', count: siArr.length, unit: 'factures' },
    { path: '/customers', count: cmap?.size || 0, unit: 'clients' },
    { path: '/suppliers', count: smap?.size || 0, unit: 'fournisseurs' },
    { path: '/ledger_entry_lines?lettering_state=unlettered&ledger_account_number_prefix=411', count: lines411Arr.length, unit: 'lignes' },
    { path: '/ledger_entry_lines?lettering_state=unlettered&ledger_account_number_prefix=401', count: lines401Arr.length, unit: 'lignes' },
  ];

  const facts = [
    `Trial balance période courante : ${tbArr.length} lignes.`,
    `Trial balance N-1 : ${tbPrevArr.length} lignes.`,
    `Factures clients : ${ciArr.length}, dont impayées au-dessus du seuil : ${unpaidC.count}.`,
    `Factures fournisseurs : ${siArr.length}, dont impayées au-dessus du seuil : ${unpaidS.count}.`,
    `Lignes 411 non lettrées : ${lines411Arr.length} (${c411.byAccount.length} comptes au-dessus du seuil).`,
    `Lignes 401 non lettrées : ${lines401Arr.length} (${c401.byAccount.length} comptes au-dessus du seuil).`,
  ];

  const calculations = [
    `Solde net 411/401 par compte = somme(débit) − somme(crédit).`,
    `Variation charges/produits = (N − N-1) / |N-1| ; flag si ≥30% (charges) ou ≥40% (produits) et écart absolu ≥1000€ (charges) / 2000€ (produits).`,
    `Doublons fournisseurs = même supplier_id + même montant TTC arrondi à 2 décimales sur la période.`,
    `Retard de paiement = ⌊(now − due_date) / 86400000⌋ jours.`,
    `Score readiness : pondération empirique des compteurs (cf. computeReadiness).`,
  ];

  const assumptions = [
    `Seuil de matérialité : ${EUR.format(threshold)} (paramètre \`materiality_threshold_eur\`).`,
    `Scope analyse : \`${scope}\`.`,
    `Comparatif systématique vs période précédente (${period.prevLabel}).`,
    `Détection doublons : groupe par fournisseur + montant strict, pas de fuzzy date.`,
  ];

  const limits = [];
  if (fetchErrors.length) {
    fetchErrors.forEach((e) => limits.push(`Endpoint partiellement indisponible : ${e}`));
  }
  limits.push('Lecture banque non couverte : scope `transactions:readonly` non activé.');
  limits.push('Lecture pièces jointes non couverte : scope `file_attachments:readonly` non activé.');
  limits.push('Cycles paie 64 / taxes 63 / immo 2 / emprunts 16 : flag balance uniquement, pas de détail v0.2.9.');
  limits.push('TVA encaissement et multi-établissements non retraités.');

  const recommendations = [];
  if (blockers.length) recommendations.push(`Traiter les ${blockers.length} blockers identifiés en section 1 avant ouverture du dossier.`);
  if (c411.byAccount.length) recommendations.push(`Lettrer les ${c411.byAccount.length} comptes 411 en priorité décroissante.`);
  if (c401.byAccount.length) recommendations.push(`Lettrer les ${c401.byAccount.length} comptes 401.`);
  if (duplicates.length) recommendations.push(`Vérifier ${duplicates.length} doublon(s) fournisseur potentiel(s) avant validation.`);
  if (chargeAnomalies.length) recommendations.push(`Documenter ${chargeAnomalies.length} variation(s) de charges significatives.`);
  if (includeRequests) recommendations.push('Copier les drafts de la section 3 dans Pennylane → Demandes au client.');
  recommendations.push('Valider le commentaire de révision de la section 4 (ou le réécrire).');
  if (recommendations.length === 0) recommendations.push('Aucune action critique sur cette période.');

  // Assemble
  const out = [
    section1Synthese({ readiness, period, prev: { label: period.prevLabel }, focus, blockers }),
    section2Cycles({ c411, c401, unpaidC, unpaidS, duplicates, chargeAnomalies, revenueSignals, fetchErrors }),
    section3Demandes({ unpaidC, duplicates, chargeAnomalies, customerMap: cmap, includeRequests }),
    section4Comments({ readiness, period, c411, c401, unpaidC }),
    section5AuditTrail({ endpoints, facts, calculations, assumptions, limits, recommendations, period }),
  ].filter(Boolean).join('\n');

  return out;
}
