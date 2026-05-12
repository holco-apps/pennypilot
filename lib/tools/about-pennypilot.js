// Tool 4 (v0.2.0) : about_pennypilot
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
- Si l'utilisateur a déjà posé une question métier précise (factures, P&L, note de synthèse) — appeler directement le bon outil métier.
- Si l'utilisateur poursuit une analyse en cours.

Ne prend aucun paramètre.`,
  inputSchema: { type: 'object', properties: {} },
};

const WELCOME = `# Bonjour 👋

Je suis **PennyPilot**, le copilote IA de votre cabinet sur Pennylane. Je suis là pour vous faire gagner ~1h30 par dossier sur la note de synthèse mensuelle.

## Trois outils à votre disposition

**1. Trésorerie clients** \`find_unpaid_customer_invoices\`
Liste les factures non payées avec échéance dépassée, total dû TTC, top 3 retardataires, alerte sur les > 60 jours.
> *« Quelles factures clients sont en retard de plus de 30 jours ? »*

**2. Compte de résultat synthétique** \`get_company_pnl\`
P&L pour un mois, un trimestre ou une année, comparatif vs période précédente, anomalies signalées (marge faible, résultat négatif, variations > 30 %).
> *« Donne-moi le P&L de mai 2026 »*

**3. Note de synthèse mensuelle** \`generate_monthly_close_report\`
Le tool à plus forte valeur — document complet prêt à coller dans le livrable client : chiffres clés, P&L commenté, trésorerie, dépenses anormales, doublons fournisseurs, actions cabinet priorisées. 4 tons disponibles (neutral, alerting, concise, detailed).
> *« Génère la note de synthèse de mai 2026 pour mon dossier »*

## Pour démarrer

Posez-moi simplement une question en français, comme à un collaborateur. Mes réponses arrivent en 6 à 10 secondes. Je cite toujours mes sources Pennylane (id de facture, période exacte) — vous gardez la main sur la validation finale.

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
