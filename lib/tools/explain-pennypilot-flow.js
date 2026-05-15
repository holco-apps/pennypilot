// Tool : explain_pennypilot_flow
// Explique le fonctionnement MCP, sans fetch Pennylane.

export const explainPennypilotFlowSchema = {
  name: 'explain_pennypilot_flow',
  description: `Explique simplement ce qui se passe quand l'utilisateur écrit une demande dans Claude avec PennyPilot installé : Claude décide d'appeler un outil, PennyPilot interroge Pennylane en lecture seule, puis Claude rédige la réponse.

À utiliser quand l'utilisateur demande :
- "Comment fonctionne PennyPilot ?"
- "Est-ce que PennyPilot lit toute ma conversation ?"
- "Est-ce que PennyPilot prend la main sur Claude ?"
- "Que se passe-t-il quand j'écris une question ?"
- "Mes données passent-elles par HOLCO ?"`,
  inputSchema: { type: 'object', properties: {} },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export async function explainPennypilotFlow() {
  return `# Comment PennyPilot fonctionne

PennyPilot ne prend pas la main sur Claude et ne lit pas toute votre conversation en continu.

## Quand vous écrivez une question

1. Vous écrivez dans Claude, en français, comme à un collaborateur.
2. Claude lit votre demande.
3. Si des données Pennylane sont nécessaires, Claude appelle un outil PennyPilot.
4. PennyPilot reçoit uniquement les paramètres structurés utiles à cet outil.
5. PennyPilot interroge l'API Pennylane **en lecture seule** depuis ce poste.
6. PennyPilot renvoie à Claude des faits, calculs, sources et limites.
7. Claude rédige la réponse finale dans la conversation.

## Ce que PennyPilot ne fait pas

- Il ne crée rien dans Pennylane.
- Il ne modifie rien dans Pennylane.
- Il ne lettre pas d'écritures.
- Il n'envoie pas de facture, de brouillon ou d'écriture.
- Il ne transmet pas votre token Pennylane à HOLCO.

## Rôle du cabinet

PennyPilot prépare le travail : lecture, contrôles, synthèses, demandes client à copier, commentaires de révision à valider.

Le cabinet garde la validation finale.`;
}
