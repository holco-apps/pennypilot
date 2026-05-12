// Tool 3 : generate_monthly_close_report
// Wrapper MCP léger qui délègue au playbook lib/playbooks/monthly-close.js.
// C'est le tool à plus forte valeur produit (1h30 économisée par dossier sur la
// note de synthèse mensuelle, slogan HOLCO).

import { buildMonthlyClose } from '../playbooks/monthly-close.js';
import { requestContextIfMissing } from '../context-guard.js';

export const generateMonthlyCloseSchema = {
  name: 'generate_monthly_close_report',
  description: `Génère une **note de synthèse mensuelle complète** pour un dossier, prête à coller dans le livrable client. Chaîne plusieurs analyses : P&L, trésorerie clients, dépenses anormales (vs moyenne 3 mois), doublons fournisseurs, actions cabinet priorisées. Markdown structuré.

⚠️ **AVANT** de lancer ce tool, tu DOIS avoir établi le contexte du dossier (activité, secteur, saisonnalité, particularités). Le tool auto-détecte le SIREN + activité NAF, mais refusera de produire la note tant que l'utilisateur n'a pas confirmé/complété le contexte (1-2 phrases suffisent). Transmets ce contexte via le paramètre \`dossier_context\`.

À utiliser quand l'utilisateur demande :
- "Génère la note de synthèse de [mois]"
- "Prépare la note mensuelle pour [mois] sur [client]"
- "Bilan du mois clos"

Ne PAS utiliser pour :
- Une simple lecture du P&L (utiliser get_company_pnl, plus léger)
- Le détail des factures impayées (utiliser find_unpaid_customer_invoices)
- Plusieurs mois consécutifs (1 mois à la fois)`,
  inputSchema: {
    type: 'object',
    properties: {
      month: {
        type: 'string',
        description: 'Mois cible au format "YYYY-MM" (ex : "2026-04"). Obligatoire.',
      },
      tone: {
        type: 'string',
        enum: ['neutral', 'alerting', 'concise', 'detailed'],
        description: 'Ton : neutral (défaut), alerting, concise, detailed.',
      },
      dossier_context: {
        type: 'string',
        description:
          "Contexte cabinet du dossier (1-3 phrases) : activité, modèle B2B/B2C, saisonnalité de la période, particularités comptables, état de saisie. REQUIS — si absent ou trop vague, le tool retourne l'auto-détection SIREN/NAF + une question à poser à l'user.",
      },
    },
    required: ['month'],
  },
};

export async function generateMonthlyClose(args = {}) {
  // Guard contexte : refuser la note tant que le contexte n'est pas établi
  const contextPrompt = await requestContextIfMissing(args.dossier_context, {
    analysisName: 'la note de synthèse mensuelle',
    period: args.month || 'le mois demandé',
  });
  if (contextPrompt) return contextPrompt;

  return buildMonthlyClose({
    month: args.month,
    tone: args.tone || 'neutral',
    dossierContext: args.dossier_context,
  });
}
