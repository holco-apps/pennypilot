// Tool : diagnose_pennypilot_setup
// Diagnostic guidé post-installation. N'affiche jamais les secrets.

import { assertHolcoLicense } from '../holco-license.js';
import { getMe } from '../pennylane-client.js';
import { formatSetupDiagnostics, runSetupDiagnostics } from '../setup-diagnostics.js';

export const diagnosePennypilotSetupSchema = {
  name: 'diagnose_pennypilot_setup',
  description: `Vérifie l'installation PennyPilot après ajout dans Claude Desktop : clé HOLCO, token Pennylane, accès au dossier via /me, identité du dossier, et disponibilité des scopes quand Pennylane les expose.

À utiliser quand l'utilisateur dit :
- "PennyPilot, vérifie mon installation"
- "J'ai installé PennyPilot"
- "Est-ce que mon token fonctionne ?"
- "Pourquoi PennyPilot ne marche pas ?"
- "Diagnostic setup"

Ne révèle jamais la clé HOLCO ni le token Pennylane.`,
  inputSchema: { type: 'object', properties: {} },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

export async function diagnosePennypilotSetup() {
  const diag = await runSetupDiagnostics({ assertLicense: assertHolcoLicense, getMe });
  return formatSetupDiagnostics(diag);
}
