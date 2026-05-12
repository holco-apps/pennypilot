// Tool 3 : generate_monthly_close_report
// Wrapper MCP léger qui délègue au playbook lib/playbooks/monthly-close.js.
// C'est le tool à plus forte valeur produit (1h30 économisée par dossier sur la
// note de synthèse mensuelle, slogan HOLCO).

import { buildMonthlyClose } from '../playbooks/monthly-close.js';

export const generateMonthlyCloseSchema = {
  name: 'generate_monthly_close_report',
  description: `Génère une **note de synthèse mensuelle** complète pour un dossier comptable, prête à coller dans un livrable client. Chaîne plusieurs analyses : compte de résultat synthétique, état trésorerie clients (factures en retard), détection des dépenses anormales (vs moyenne 3 mois précédents), repérage des doublons fournisseurs, et liste d'actions cabinet recommandées. Le tout formaté en Markdown structuré.

À utiliser quand l'utilisateur demande :
- "Génère la note de synthèse de [mois]"
- "Prépare la note mensuelle pour [mois] sur [client]"
- "Bilan du mois clos"
- "Rapport mensuel cabinet"
- "Synthèse de clôture pour le client"

Ne PAS utiliser pour :
- Une simple lecture du P&L (utiliser get_company_pnl, plus léger)
- Le détail des factures impayées (utiliser find_unpaid_customer_invoices)
- Les analyses sur plusieurs mois consécutifs (ce tool produit la note d'UN mois)
- Les bilans annuels ou trimestriels (utiliser get_company_pnl avec period appropriée)`,
  inputSchema: {
    type: 'object',
    properties: {
      month: {
        type: 'string',
        description:
          'Mois cible au format "YYYY-MM" (ex : "2026-04" pour avril 2026). Obligatoire — c\'est une note d\'UN mois donné, pas une plage.',
      },
      tone: {
        type: 'string',
        enum: ['neutral', 'alerting', 'concise', 'detailed'],
        description:
          'Ton de la note. "neutral" (défaut) = standard cabinet. "alerting" = met les anomalies en avant ("À RÉGLER"). "concise" = version courte (synthèse 3 chiffres + anomalies + actions, sans détail P&L/trésorerie). "detailed" = version étendue avec recommandations argumentées par anomalie.',
      },
    },
    required: ['month'],
  },
};

export async function generateMonthlyClose(args = {}) {
  return buildMonthlyClose({
    month: args.month,
    tone: args.tone || 'neutral',
  });
}
