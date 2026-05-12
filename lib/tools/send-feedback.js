// Tool : send_feedback_to_holco
// Permet à un utilisateur de transmettre un retour, bug, idée ou commentaire
// à l'équipe HOLCO directement depuis Claude Desktop. Le serveur HOLCO archive
// le message + notifie l'équipe par email. Le cabinet est identifié via la clé HOLCO.
// Aucune donnée comptable n'est transmise sauf si l'user l'inclut explicitement
// dans le message ou le context_summary.

import crypto from 'node:crypto';

export const sendFeedbackSchema = {
  name: 'send_feedback_to_holco',
  description: `Transmet un **retour, signalement de bug, idée d'amélioration ou commentaire** à l'équipe HOLCO. Le message est archivé côté serveur HOLCO et déclenche immédiatement une notification email à l'équipe pendant la phase pilote.

À utiliser EXACTEMENT quand l'utilisateur :
- Tape **"@holco"** dans son message (avec une suite indiquant ce qu'il veut transmettre)
- Dit "signale ce bug à HOLCO", "envoie un feedback à l'équipe", "j'ai une idée pour PennyPilot"
- Décrit un comportement inattendu ET demande explicitement à le rapporter
- Demande "transmet à HOLCO …" ou "fais remonter cette info à l'équipe"

Paramètres :
- \`message\` (requis) : le retour de l'utilisateur, en clair, en français. Reformuler/synthétiser si l'user a tapé "@holco la note de synthèse est buggée" → "La note de synthèse présente un bug : …"
- \`category\` (optionnel) : "bug" | "feature_request" | "comment" | "question" — détecter depuis le ton. Bug si l'user signale un dysfonctionnement, feature_request si suggestion, question si demande de clarification, comment sinon. Défaut : "comment".
- \`context_summary\` (optionnel) : 1-2 phrases de contexte (ex : "Bug constaté en générant la note de synthèse sur dossier retail X — CA ressort à 0 alors que les ventes existent"). **NE PAS** inclure de chiffres précis du dossier (montants, n° de comptes individuels), juste le contexte fonctionnel.

NE PAS utiliser :
- Pour répondre à une question de l'utilisateur (réponds normalement avec les autres outils)
- Pour de l'analyse comptable (utiliser les outils Grand livre)
- Sans demande explicite (ne pas "transmettre" un échange normal)

Après envoi, le tool retourne une référence \`fb-XXX\` que tu peux mentionner à l'utilisateur pour traçabilité.`,
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Le retour utilisateur, reformulé en clair si nécessaire.' },
      category: {
        type: 'string',
        enum: ['bug', 'feature_request', 'comment', 'question'],
        description: 'Type de feedback détecté.',
      },
      context_summary: {
        type: 'string',
        description: '1-2 phrases de contexte fonctionnel (sans données sensibles).',
      },
    },
    required: ['message'],
  },
};

const FEEDBACK_URL = 'https://apps.holco.co/api/onboarding/feedback';

function hashKey(k) {
  return crypto.createHash('sha256').update(k.trim()).digest('hex');
}

const CATEGORY_LABELS = {
  bug: '🐛 Bug signalé',
  feature_request: '💡 Idée d\'amélioration',
  comment: '💬 Commentaire',
  question: '❓ Question',
};

export async function sendFeedback(args = {}) {
  const message = String(args.message || '').trim();
  if (!message) throw new Error('message requis');
  const category = ['bug', 'feature_request', 'comment', 'question'].includes(args.category)
    ? args.category
    : 'comment';
  const contextSummary = (args.context_summary || '').trim().slice(0, 1000);

  const licenseKey = process.env.HOLCO_LICENSE_KEY || '';
  const license_key_hash = licenseKey ? hashKey(licenseKey) : null;

  const body = {
    license_key_hash,
    message: message.slice(0, 4000),
    category,
    context_summary: contextSummary || null,
    pennypilot_version: '0.2.4',
    submitted_at: new Date().toISOString(),
  };

  let res;
  try {
    res = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PennyPilot/0.2.4 (HOLCO)',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return `# Feedback non envoyé\n\nLe serveur HOLCO est inaccessible (${e.message}). Réessaie dans quelques instants ou écris directement à **alan@holco.co**.\n\nTon message a bien été lu de mon côté — je peux te le redonner si tu veux le copier ailleurs :\n\n> ${message}`;
  }

  let json = {};
  try { json = await res.json(); } catch {}

  if (!res.ok || !json.ok) {
    return `# Feedback non envoyé\n\nLe serveur HOLCO a refusé le retour (HTTP ${res.status} — ${json.error || 'raison non précisée'}). Écris directement à **alan@holco.co** avec ton message :\n\n> ${message}`;
  }

  const ref = json.ref || 'fb-unknown';
  const label = CATEGORY_LABELS[category];
  const followUp = category === 'bug' || category === 'question'
    ? "L'équipe HOLCO te recontacte sous 24 h."
    : "Merci pour ce retour — il vient nourrir la roadmap PennyPilot directement.";

  return `# Feedback transmis à HOLCO ✓

**Référence** : \`${ref}\`
**Catégorie** : ${label}

${followUp}

Tu peux toujours nous écrire en complément à **alan@holco.co** (le \`ref\` ci-dessus aide à retrouver ton retour).`;
}
