// Tool : generate_revision_triage
// Pré-révision read-only : checklist + drafts à copier dans Pennylane.
// Naming user-facing : « Pré-révision ». Tool MCP technique : generate_revision_triage.

import { runRevisionTriage } from '../playbooks/revision-triage.js';
import { requestContextIfMissing } from '../context-guard.js';

export const generateRevisionTriageSchema = {
  name: 'generate_revision_triage',
  description: `Produit un **cockpit de pré-révision** pour le dossier comptable courant Pennylane : checklist d'urgence, points bloquants par cycle (411/401/charges/produits), drafts de demandes client, commentaires de révision pré-rédigés, et audit trail strict.

Strictement **lecture seule** : aucune modification dans Pennylane (pas de lettrage, pas de création d'écriture, pas d'envoi de demande). Le collaborateur copie ce qui l'intéresse dans son dossier de travail.

À utiliser quand l'utilisateur demande :
- "Prépare la révision de mai"
- "Prépare la pré-révision"
- "Donne-moi le cockpit avant ouverture du dossier"
- "Triage de révision pour T1 2026"
- "Qu'est-ce qui bloque la révision ce mois-ci ?"
- "Liste les blockers révision"

Paramètres :
- \`period\` : "YYYY-MM" (mois), "YYYY-Qn" (trimestre), ou "YYYY" (exercice). Défaut : mois précédent.
- \`scope\` : "monthly_review" (défaut) / "closing" / "supervision".
- \`materiality_threshold_eur\` : seuil de matérialité, défaut 100€.
- \`include_client_requests\` : produit la section "Demandes client préparées", défaut true.
- \`dossier_context\` : contexte d'activité (saisonnalité, multi-établissements, particularités) — requis si non confirmé via le context-guard.

Ne PAS utiliser pour :
- Faire le lettrage automatique (PennyPilot est read-only par conception).
- Envoyer un message au client (drafts à copier manuellement).
- La note de synthèse mensuelle finale (utiliser \`generate_monthly_close_report\`).`,
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        description: "Période comptable. Format : 'YYYY-MM' (mois), 'YYYY-Qn' (trimestre), 'YYYY' (exercice). Défaut : mois précédent.",
      },
      scope: {
        type: 'string',
        enum: ['monthly_review', 'closing', 'supervision'],
        description: "Type de révision. Défaut : monthly_review.",
      },
      materiality_threshold_eur: {
        type: 'number',
        description: "Seuil de matérialité en euros. Défaut : 100.",
      },
      include_client_requests: {
        type: 'boolean',
        description: "Inclure la section 'Demandes client préparées'. Défaut : true.",
      },
      dossier_context: {
        type: 'string',
        description: "Contexte du dossier (activité, saisonnalité, multi-établissements, particularités cabinet). Si non fourni, l'outil demandera confirmation avant analyse.",
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function generateRevisionTriage(args = {}) {
  const need = await requestContextIfMissing(args.dossier_context, {
    analysisName: 'la pré-révision',
    period: args.period || 'la période demandée',
  });
  if (need) return need;

  return runRevisionTriage(args);
}
