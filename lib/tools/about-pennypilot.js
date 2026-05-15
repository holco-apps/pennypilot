// Tool : about_pennypilot
// Carte d'accueil PennyPilot. Pas de fetch Pennylane, pure réponse texte.

export const aboutPennypilotSchema = {
  name: 'about_pennypilot',
  description: `Présente PennyPilot, ses 14 outils comptables read-only et ses 3 outils d'aide à l'installation. Retourne une carte d'accueil structurée en français.

À utiliser quand l'utilisateur :
- Démarre une nouvelle conversation et tape "Bonjour", "Salut", "Hello"
- Demande "Que peux-tu faire ?", "Quels outils PennyPilot as-tu ?", "Présente-toi"
- Demande "Qu'est-ce que PennyPilot ?", "Comment ça marche ?", "Aide-moi"
- A besoin de comprendre les capacités avant de poser une question métier

NE PAS utiliser :
- Si l'utilisateur a déjà posé une question métier précise — appeler directement le bon outil.
- Si l'utilisateur poursuit une analyse en cours.

Ne prend aucun paramètre.`,
  inputSchema: { type: 'object', properties: {} },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

import { VERSION } from '../version.js';

const WELCOME = (v) => `# Bonjour 👋

Je suis **PennyPilot v${v}**, le copilote IA de votre cabinet sur Pennylane. Je couvre la production de la note client, la lecture financière, et le cœur du métier comptable (Grand livre, journaux, lettrage, audit).

## Démarrage recommandé

_Ces 3 outils fonctionnent même si l'installation n'est pas encore complète._

- \`start_pennypilot\` — **Démarrage guidé** après installation : vérifie le dossier, explique le mode read-only et propose les premières commandes.
  > *« PennyPilot, démarre »*
- \`diagnose_pennypilot_setup\` — **Diagnostic installation** : clé HOLCO, token Pennylane, accès \`/me\`, dossier détecté, sans afficher de secret.
  > *« PennyPilot, vérifie mon installation »*
- \`explain_pennypilot_flow\` — **Comment ça marche** : ce que Claude envoie à PennyPilot, ce que PennyPilot interroge, ce qui reste local.
  > *« Explique-moi comment PennyPilot fonctionne »*

## 🆕 Deux fondamentaux à connaître

**Contexte du dossier établi AVANT toute analyse.** Avant de lancer une note de synthèse ou un P&L, je récupère automatiquement le SIREN + l'activité (NAF) depuis l'open data publique, et je vous demande UNE confirmation rapide (1 phrase) sur la saisonnalité et particularités cabinet. Plus de note avec CA=0 sur un retail saisonnier — je sais ce que je regarde.

**Feedback direct vers HOLCO.** Tapez **@holco** dans votre message pour me signaler un bug, une idée ou un commentaire — j'envoie directement à l'équipe HOLCO avec votre cabinet identifié (clé HOLCO). Réponse sous 24 h pour les bugs et questions.

## Lecture financière

- \`generate_monthly_close_report\` — **Note de synthèse mensuelle** complète prête à coller dans le livrable client. 4 tons disponibles.
  > *« Génère la note de synthèse de mai 2026 »*
- \`generate_revision_triage\` — **Pré-révision** : checklist d'urgence + points bloquants par cycle + drafts de demandes client + commentaires de révision pré-rédigés. Strictement read-only, à copier dans Pennylane.
  > *« Prépare la révision de mai »*
- \`get_company_pnl\` — **Compte de résultat synthétique** mois/trimestre/année, comparatif vs N-1, anomalies.
  > *« Donne-moi le P&L de mai 2026 »*
- \`find_unpaid_customer_invoices\` — **Factures clients en retard**, top 3 retardataires, alerte > 60 jours.
  > *« Quelles factures clients sont en retard de plus de 30 jours ? »*

## Grand livre & comptabilité

- \`list_journals\` — **Liste des journaux** (VE, AC, BQ, OD…)
- \`get_chart_of_accounts\` — **Plan comptable** groupé par classe PCG
- \`browse_account_ledger\` — **Grand livre par compte** sur une période, avec solde cumulé
- \`find_unlettered_entries\` — **Lettrage en attente**, priorisé
- \`browse_journal_entries\` — **Écritures comptables** par période, par journal
- \`get_journal_entry_detail\` — **Détail d'une écriture** (équilibrage, lignes, lettrage)
- \`audit_recent_changes\` — **Audit trail** des modifications récentes
- \`list_fiscal_years\` — **Exercices comptables** (ouvert/clos)

## Feedback HOLCO

- \`send_feedback_to_holco\` — déclenché par **@holco** dans votre message. Bug / idée / commentaire transmis instantanément à l'équipe.

## Pour démarrer

Posez-moi simplement une question en français, comme à un collaborateur. Mes réponses arrivent en 6 à 10 secondes. Je cite toujours mes sources Pennylane (id de facture, période exacte, endpoint API) — vous gardez la main sur la validation finale.

## Sécurité

- Votre **token Pennylane reste local** sur ce poste, jamais transmis à HOLCO.
- **Aucune donnée comptable** ne transite par les serveurs HOLCO.
- **Lecture seule** stricte en v0.2 — aucun risque de modification de vos dossiers Pennylane.
- Pour le feedback @holco, seul le **hash de votre clé HOLCO** + le texte de votre message sont envoyés (pas de données comptables sauf si vous les incluez vous-même).

Plus d'infos : <https://apps.holco.co/mcp/pennylane/docs/security>

À vous — quelle est votre première question ?`;

export async function aboutPennypilot() {
  return WELCOME(VERSION);
}
