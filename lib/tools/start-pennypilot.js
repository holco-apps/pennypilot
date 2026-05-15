// Tool : start_pennypilot
// Welcome guidé post-installation : diagnostic + premiers usages.

import { assertHolcoLicense } from '../holco-license.js';
import { getMe } from '../pennylane-client.js';
import { runSetupDiagnostics } from '../setup-diagnostics.js';

export const startPennypilotSchema = {
  name: 'start_pennypilot',
  description: `Démarre PennyPilot après installation : vérifie l'installation, explique le mode read-only, puis propose les premières commandes utiles.

À utiliser quand l'utilisateur dit :
- "PennyPilot, démarre"
- "PennyPilot, commence"
- "J'ai installé PennyPilot"
- "Aide-moi à démarrer"
- "Que dois-je faire en premier ?"`,
  inputSchema: { type: 'object', properties: {} },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function startPennypilot() {
  const diag = await runSetupDiagnostics({ assertLicense: assertHolcoLicense, getMe });
  const lines = [];

  if (diag.status === 'blocked') {
    lines.push(`# PennyPilot n'est pas encore prêt`);
    lines.push('');
    lines.push(`Je dois d'abord valider l'installation avant de lancer une analyse métier.`);
    lines.push('');
    lines.push(`## Points à corriger`);
    for (const issue of diag.issues) lines.push(`- ${issue}`);
    lines.push('');
    lines.push(`Relance ensuite : **« PennyPilot, vérifie mon installation »**.`);
    lines.push('');
    lines.push(`_Aucun secret n'est affiché._`);
    return lines.join('\n');
  }

  lines.push(`# PennyPilot est connecté`);
  lines.push('');
  if (diag.company) lines.push(`Dossier détecté : **${diag.company}**`);
  lines.push(`Mode : **lecture seule par conception**`);
  lines.push(`Token Pennylane : **valide**`);
  lines.push(`Clé HOLCO : **valide**`);
  lines.push('');

  lines.push(`## Comment ça marche`);
  lines.push(`Quand vous posez une question, Claude peut appeler PennyPilot si vos données Pennylane sont nécessaires. PennyPilot interroge Pennylane en lecture seule, puis renvoie les faits, calculs et limites. Rien n'est créé, modifié, lettré ou supprimé dans Pennylane.`);
  lines.push('');

  lines.push(`## Choisissez votre premier usage`);
  lines.push(`1. **Préparer une pré-révision** — disponible via \`generate_revision_triage\`.`);
  lines.push(`2. **Générer une note mensuelle** — synthèse client prête à relire.`);
  lines.push(`3. **Contrôler les impayés** — factures clients en retard et montants prioritaires.`);
  lines.push(`4. **Explorer le Grand livre** — compte, journal, écritures et lettrage en attente.`);
  lines.push('');

  lines.push(`## Exemples à copier`);
  lines.push(`- « Génère la note de synthèse de mai 2026, ton concis. »`);
  lines.push(`- « Quelles factures clients ont plus de 30 jours de retard ? »`);
  lines.push(`- « Montre-moi le Grand livre du compte 411 sur mai 2026. »`);
  lines.push(`- « Liste les écritures non lettrées fournisseurs de plus de 60 jours. »`);
  lines.push('');
  lines.push(`Pour comprendre le fonctionnement : **« Explique-moi comment PennyPilot utilise Claude et Pennylane. »**`);

  return lines.join('\n');
}
