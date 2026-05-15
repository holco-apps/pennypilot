const HOLCO_KEY_RE = /^HOLCO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function companyFromMe(me = {}) {
  return me.company || me.current_company || me.organization || {};
}

function companyLine(me = {}) {
  const company = companyFromMe(me);
  const name = company.name || me.company_name || 'dossier Pennylane';
  const regNo = company.reg_no || company.registration_number || company.siren || me.reg_no;
  return regNo ? `${name} (${regNo})` : name;
}

function scopesFromMe(me = {}) {
  const raw = me.scopes || me.scope || me.permissions || me.access_scopes || [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function classifyDiagnostics(diag) {
  if (!diag.holco.ok || !diag.pennylane.ok) return 'blocked';
  if (diag.scopeStatus === 'unknown' || diag.warnings.length > 0) return 'warning';
  return 'ok';
}

export function formatSetupDiagnostics(diag) {
  const status =
    diag.status === 'ok'
      ? 'OK'
      : diag.status === 'warning'
        ? 'À vérifier'
        : 'Bloqué';

  const lines = [];
  lines.push(`# Diagnostic PennyPilot — ${status}`);
  lines.push('');
  lines.push(`## État`);
  lines.push(`- Clé HOLCO : ${diag.holco.ok ? 'OK' : 'bloquée'}${diag.holco.message ? ` — ${diag.holco.message}` : ''}`);
  lines.push(`- Token Pennylane : ${diag.pennylane.ok ? 'OK' : 'bloqué'}${diag.pennylane.message ? ` — ${diag.pennylane.message}` : ''}`);
  if (diag.company) lines.push(`- Dossier détecté : **${diag.company}**`);
  if (diag.scopes.length > 0) lines.push(`- Scopes déclarés par Pennylane : \`${diag.scopes.join('`, `')}\``);
  else lines.push(`- Scopes : non exposés par \`/me\` sur ce dossier — vérifier dans Pennylane si un outil retourne 403.`);
  lines.push('');

  if (diag.status === 'blocked') {
    lines.push(`## À corriger`);
    for (const issue of diag.issues) lines.push(`- ${issue}`);
    lines.push('');
    lines.push(`Une fois corrigé, relance : **« PennyPilot, vérifie mon installation »**.`);
  } else {
    lines.push(`## Première commande recommandée`);
    lines.push(`**« PennyPilot, démarre »**`);
    lines.push('');
    lines.push(`Puis choisissez un premier usage : note mensuelle, impayés, Grand livre, ou pré-révision.`);
  }

  if (diag.warnings.length > 0) {
    lines.push('');
    lines.push(`## Points d'attention`);
    for (const warning of diag.warnings) lines.push(`- ${warning}`);
  }

  lines.push('');
  lines.push(`_Aucun secret n'est affiché : ni clé HOLCO, ni token Pennylane._`);
  return lines.join('\n');
}

export async function runSetupDiagnostics({
  env = process.env,
  assertLicense,
  getMe,
} = {}) {
  const diag = {
    holco: { ok: false, message: '' },
    pennylane: { ok: false, message: '' },
    company: '',
    scopes: [],
    scopeStatus: 'unknown',
    issues: [],
    warnings: [],
    status: 'blocked',
  };

  const holcoKey = (env.HOLCO_LICENSE_KEY || '').trim();
  if (!holcoKey) {
    diag.holco.message = 'clé absente';
    diag.issues.push('Renseigner la clé HOLCO reçue par email dans la configuration de l’extension.');
  } else if (!HOLCO_KEY_RE.test(holcoKey)) {
    diag.holco.message = 'format inattendu';
    diag.issues.push('Vérifier le format de la clé HOLCO : `HOLCO-XXXX-XXXX-XXXX-XXXX`.');
  } else if (assertLicense) {
    try {
      await assertLicense();
      diag.holco.ok = true;
    } catch (err) {
      diag.holco.message = err.message;
      diag.issues.push('La clé HOLCO est invalide, révoquée, ou impossible à vérifier. Contacter alan@holco.co si besoin.');
    }
  } else {
    diag.holco.ok = true;
    diag.warnings.push('Clé HOLCO au bon format, mais registre HOLCO non interrogé dans ce diagnostic.');
  }

  const token = (env.PENNYLANE_TOKEN || '').trim();
  if (!token) {
    diag.pennylane.message = 'token absent';
    diag.issues.push('Renseigner un token Pennylane Company API v2 dans la configuration de l’extension.');
  } else if (!getMe) {
    diag.pennylane.ok = true;
    diag.warnings.push('Token Pennylane présent, mais `/me` non interrogé dans ce diagnostic.');
  } else {
    try {
      const me = await getMe();
      diag.pennylane.ok = true;
      diag.company = companyLine(me);
      diag.scopes = scopesFromMe(me);
      diag.scopeStatus = diag.scopes.length > 0 ? 'reported' : 'unknown';
    } catch (err) {
      diag.pennylane.message = err.message;
      diag.issues.push('Le token Pennylane ne permet pas d’appeler `/me`. Le régénérer dans Pennylane > Paramètres > Connectivité > Développeurs.');
    }
  }

  diag.status = classifyDiagnostics(diag);
  return diag;
}
