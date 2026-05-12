// Tool : about_pennypilot
// Carte d'accueil PennyPilot. Pas de fetch Pennylane, pure réponse texte.
// Claude appelle ce tool en début de conversation ou quand l'utilisateur
// demande "que peux-tu faire ?".

export const aboutPennypilotSchema = {
  name: 'about_pennypilot',
  description: `Présente PennyPilot et ses outils à l'utilisateur. Retourne une carte d'accueil structurée en français.

À utiliser quand l'utilisateur :
- Démarre une nouvelle conversation et tape "Bonjour", "Salut", "Hello"
- Demande "Que peux-tu faire ?", "Quels outils PennyPilot as-tu ?", "Présente-toi"
- Demande "Qu'est-ce que PennyPilot ?", "Comment ça marche ?", "Aide-moi"
- A besoin de comprendre les capacités avant de poser une question métier

NE PAS utiliser :
- Si l'utilisateur a déjà posé une question métier précise (factures, P&L, note de synthèse, grand livre) — appeler directement le bon outil métier.
- Si l'utilisateur poursuit une analyse en cours.

Ne prend aucun paramètre.`,
  inputSchema: { type: 'object', properties: {} },
};

const WELCOME = `# Bonjour 👋

Je suis **PennyPilot v0.2.2**, le copilote IA de votre cabinet sur Pennylane. Je vous fais gagner ~1h30 par dossier sur la note de synthèse mensuelle et je couvre le cœur du métier comptable.

## 7 outils Pennylane à votre disposition

### Production de la note client
- \`generate_monthly_close_report\` — **Note de synthèse mensuelle** complète, prête à coller dans le livrable client (3 chiffres clés, P&L commenté, trésorerie, dépenses anormales, doublons fournisseurs, actions cabinet priorisées). 4 tons disponibles.
  > *« Génère la note de synthèse de mai 2026 pour mon dossier »*

### Lecture financière
- \`get_company_pnl\` — **Compte de résultat synthétique** mois/trimestre/année, comparatif vs période précédente, anomalies signalées.
  > *« Donne-moi le P&L de mai 2026 »*
- \`find_unpaid_customer_invoices\` — **Factures clients en retard**, top 3 retardataires, alerte > 60 jours.
  > *« Quelles factures clients sont en retard de plus de 30 jours ? »*

### Grand livre & comptabilité 🆕 (v0.2.2)
- \`list_journals\` — **Liste des journaux** du dossier (VE, AC, BQ, OD…).
  > *« Quels journaux sont configurés sur ce dossier ? »*
- \`get_chart_of_accounts\` — **Plan comptable** groupé par classe PCG, filtrable par préfixe.
  > *« Liste les comptes 6xxx utilisés sur ce dossier »*
- \`browse_account_ledger\` — **Grand livre par compte** : toutes les écritures d'un compte sur une période, avec solde courant cumulé.
  > *« Grand livre du compte 411 sur janvier 2026 »*
- \`find_unlettered_entries\` — **Lettrage en attente** : écritures clients/fournisseurs non lettrées, prioritisées par enjeu et par ancienneté.
  > *« Quels comptes clients ont du lettrage à faire ? »*

## Pour démarrer

Posez-moi simplement une question en français, comme à un collaborateur. Mes réponses arrivent en 6 à 10 secondes. Je cite toujours mes sources Pennylane (id de facture, période exacte, endpoint API) — vous gardez la main sur la validation finale.

## Sécurité

- Votre **token Pennylane reste local** sur ce poste, jamais transmis à HOLCO.
- **Aucune donnée comptable** ne transite par les serveurs HOLCO.
- **Lecture seule** stricte en v0.2 — aucun risque de modification de vos dossiers Pennylane.

Plus d'infos : <https://apps.holco.co/mcp/pennylane/docs/security>

## Une question ?

Pendant le pilote, je suis suivi de près par l'équipe HOLCO. Pour tout retour ou support : <alan@holco.co> · code source public sur <https://github.com/holco-apps/pennypilot>.

À vous — quelle est votre première question ?`;

export async function aboutPennypilot() {
  return WELCOME;
}
