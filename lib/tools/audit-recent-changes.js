// Tool : audit_recent_changes
// Audit trail : modifications récentes sur les lignes d'écriture (création / update / delete).
// Utile pour le contrôle interne, la conformité, ou un audit qualité dossier.
// Endpoint : GET /ledger_entry_line_changes (changelog).

import { pnlFetch } from '../pennylane-client.js';

export const auditRecentChangesSchema = {
  name: 'audit_recent_changes',
  description: `Audit trail : liste les **modifications récentes** apportées aux écritures comptables (créations, mises à jour, suppressions de lignes d'écriture). Utile pour le contrôle interne, la conformité, ou un audit qualité du dossier.

À utiliser quand l'utilisateur demande :
- "Quelles écritures ont été modifiées récemment ?"
- "Qui a touché à la compta ces 7 derniers jours ?"
- "Audit des modifications de la semaine"
- "Y a-t-il eu des suppressions d'écritures ?"
- "Liste les changements depuis X"

Paramètre :
- \`since_days\` (optionnel) : nombre de jours en arrière à examiner. Défaut 7. Max recommandé 90.

Ne PAS utiliser pour :
- Voir le détail d'une écriture (utiliser get_journal_entry_detail)
- Modifier une écriture (PennyPilot v0.2 est en lecture seule)`,
  inputSchema: {
    type: 'object',
    properties: {
      since_days: { type: 'number', description: 'Nombre de jours en arrière. Défaut 7. Max 90.' },
    },
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchRecentChanges(sinceIso) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 50; i++) {
    const q = new URLSearchParams({
      limit: '100',
      modified_since: sinceIso,
    });
    if (cursor) q.set('cursor', cursor);
    let data;
    try {
      data = await pnlFetch(`/ledger_entry_line_changes?${q}`);
    } catch (err) {
      throw new Error(`Endpoint /ledger_entry_line_changes indisponible ou refusé (${err.message}). Vérifier scopes Pennylane (ledger_entries:readonly).`);
    }
    all.push(...(data.items || []));
    if (!data.has_more) break;
    cursor = data.next_cursor;
  }
  return all;
}

const OP_LABELS = { create: 'création', update: 'modification', delete: 'suppression' };

export async function auditRecentChanges(args = {}) {
  const sinceDays = Math.min(Math.max(Number(args.since_days ?? 7), 1), 90);
  const since = new Date(Date.now() - sinceDays * DAY_MS);
  const sinceIso = since.toISOString();

  let changes;
  try {
    changes = await fetchRecentChanges(sinceIso);
  } catch (err) {
    return `# Audit des modifications\n\n**Erreur d'accès Pennylane** : ${err.message}\n\nL'endpoint changelog n'est peut-être pas encore activé sur ce dossier (feature dépendante de la migration API 2026 Pennylane). Contactez alan@holco.co.`;
  }

  if (!changes.length) {
    return `# Audit des modifications\n\nAucune modification d'écriture sur les **${sinceDays} derniers jours** (depuis ${sinceIso.slice(0, 10)}). Le dossier est calme côté audit trail.`;
  }

  // Agrégat par opération
  const byOp = new Map();
  const byUser = new Map();
  for (const c of changes) {
    const op = c.operation || c.change_type || 'unknown';
    byOp.set(op, (byOp.get(op) || 0) + 1);
    const user = c.user_email || c.user_name || c.changed_by || 'inconnu';
    byUser.set(user, (byUser.get(user) || 0) + 1);
  }

  const md = [
    `# Audit des modifications — ${sinceDays} derniers jours\n`,
    `**${changes.length}** modification(s) depuis le ${sinceIso.slice(0, 10)}.\n`,
  ];

  md.push('## Répartition par opération\n');
  md.push('| Opération | Nombre |');
  md.push('|---|---:|');
  for (const [op, n] of [...byOp.entries()].sort((a, b) => b[1] - a[1])) {
    md.push(`| ${OP_LABELS[op] || op} | ${n} |`);
  }

  if (byUser.size > 1) {
    md.push('\n## Répartition par utilisateur\n');
    md.push('| Utilisateur | Modifications |');
    md.push('|---|---:|');
    for (const [u, n] of [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      md.push(`| ${u} | ${n} |`);
    }
  }

  // Top 20 récentes
  const recent = [...changes].sort((a, b) =>
    String(b.changed_at || b.timestamp || '').localeCompare(String(a.changed_at || a.timestamp || '')),
  ).slice(0, 20);

  md.push('\n## 20 modifications les plus récentes\n');
  md.push('| Quand | Opération | Compte | Utilisateur | Écriture |');
  md.push('|---|---|---|---|---|');
  for (const c of recent) {
    const when = (c.changed_at || c.timestamp || '').slice(0, 16).replace('T', ' ');
    const op = OP_LABELS[c.operation] || c.operation || c.change_type || '—';
    const acc = c.ledger_account_number || '—';
    const user = c.user_email || c.user_name || c.changed_by || '—';
    const entryId = c.ledger_entry_id || c.entry_id || '—';
    md.push(`| ${when} | ${op} | \`${acc}\` | ${user} | \`${String(entryId).slice(0, 12)}\` |`);
  }

  md.push(`\n*Source : Pennylane Company API v2 · GET /ledger_entry_line_changes (modified_since=${sinceIso.slice(0, 10)})*`);
  return md.join('\n');
}
