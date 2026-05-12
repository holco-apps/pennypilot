// context-guard.js
// Avant toute analyse "expert-comptable" (P&L, note de synthèse mensuelle),
// PennyPilot établit le contexte du dossier :
//   1. Pennylane /me → identifiant entreprise (SIREN, nom)
//   2. recherche-entreprises.api.gouv.fr → activité (NAF/APE), effectif, adresse
//   3. Affichage des éléments détectés + 1 question de confirmation à l'utilisateur
//   4. Une fois l'user a confirmé / précisé, l'analyse tourne avec ce contexte
//
// Philosophie : un cabinet ne lance pas une analyse client sans savoir si c'est
// du retail, de la conso, du B2B, multi-établissements, en fin d'exercice, etc.
// Pour ne pas alourdir, on capture 80% du contexte automatiquement (open data
// publique) et on ne demande à l'user QUE ce qui ne peut pas être deviné.

import { pnlFetch } from './pennylane-client.js';
import { USER_AGENT } from './version.js';

const GOUV_API = 'https://recherche-entreprises.api.gouv.fr/search';
const NAF_HINTS = {
  // Codes NAF → indication métier pour l'analyse
  '47': 'Commerce de détail (retail B2C, saisonnalité Q4 typique, ventes via TPE/journal caisse)',
  '46': 'Commerce de gros (B2B, marges fines, encours clients souvent élevés)',
  '56': 'Hôtellerie / restauration (saisonnalité été + fêtes, TVA souvent encaissements, encaissements espèces)',
  '70.22': 'Conseil pour les affaires (B2B prestation, récurrence mensuelle, peu de stock)',
  '62': 'Conseil informatique / dev logiciel (B2B prestation, projets, peu de stock)',
  '41': 'Construction de bâtiments (projets longs, situations de travaux, sous-traitance fréquente)',
  '43': 'Travaux de construction spécialisés (artisanat, BTP, factures de chantier)',
  '69': 'Activités juridiques / comptables (services intellectuels, B2B prestation)',
  '64': 'Activités financières (réglementations spécifiques, périodicité fiscale particulière)',
  '68': 'Activités immobilières (revenus locatifs, fiscalité immo spécifique)',
  '49': 'Transports terrestres (saisonnalité possible, charges carburant)',
  '01': 'Agriculture (saisonnalité forte, fiscalité agricole spécifique)',
  '10': 'Industries alimentaires (stock périssable)',
  '13': 'Industrie textile',
  '20': 'Industrie chimique',
  '25': 'Fabrication produits métalliques',
  '32': 'Autres industries manufacturières',
  '85': 'Enseignement (saisonnalité année scolaire)',
  '86': 'Santé humaine (réglementation spécifique)',
  '90': 'Activités culturelles / spectacle (récurrence projet)',
  '93': 'Activités sportives / récréatives (saisonnalité)',
};

export function nafHint(naf) {
  if (!naf) return null;
  const clean = String(naf).replace(/[^\d.]/g, '').slice(0, 5);
  // Test 5 chars (ex: 47.71), 4 chars (ex: 70.2), 2 chars (ex: 47)
  for (const len of [5, 4, 2]) {
    const k = clean.slice(0, len).replace(/\.$/, '');
    if (NAF_HINTS[k]) return NAF_HINTS[k];
  }
  return null;
}

/**
 * Fetch SIREN + nom + NAF + effectif depuis Pennylane + open data Etalab.
 * Retourne null si rien d'utilisable.
 */
export async function fetchAutoContext() {
  let me = null;
  try {
    me = await pnlFetch('/me');
  } catch {
    return null;
  }
  const companyName = me?.company?.name || me?.name || null;
  const siret = me?.company?.siret || me?.siret || null;
  const siren = siret ? String(siret).replace(/\D/g, '').slice(0, 9) : null;

  let gouvHit = null;
  if (siren && /^\d{9}$/.test(siren)) {
    try {
      const url = `${GOUV_API}?q=${siren}&page=1&per_page=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) gouvHit = data.results[0];
      }
    } catch {
      // Open data inaccessible → on continue sans
    }
  }

  return {
    pennylane: { companyName, siret, siren },
    gouv: gouvHit
      ? {
          nom_complet: gouvHit.nom_complet || gouvHit.nom_raison_sociale,
          nature_juridique: gouvHit.nature_juridique,
          activite_principale: gouvHit.activite_principale,
          libelle_activite: gouvHit.libelle_activite_principale || gouvHit.libelle_activite,
          tranche_effectifs: gouvHit.tranche_effectif_salarie,
          date_creation: gouvHit.date_creation,
          siege_commune: gouvHit.siege?.libelle_commune,
        }
      : null,
  };
}

/**
 * Vérifie si le dossier_context fourni par l'utilisateur est suffisant.
 * Si oui → retourne null (proceed). Sinon → retourne un markdown avec
 * l'auto-détection et une seule question de confirmation pour l'user.
 *
 * @param {string|null|undefined} context - dossier_context passé en param du tool
 * @param {object} opts - { analysisName, period }
 * @returns {Promise<string|null>}
 */
export async function requestContextIfMissing(context, opts = {}) {
  const txt = (context || '').trim();
  // Si l'user a fourni un contexte non trivial (> 25 chars), on accepte
  if (txt.length >= 25) return null;

  const analysisName = opts.analysisName || 'cette analyse';
  const period = opts.period || 'la période demandée';

  const auto = await fetchAutoContext();
  const pn = auto?.pennylane;
  const gv = auto?.gouv;
  const hint = gv?.activite_principale ? nafHint(gv.activite_principale) : null;

  // Construction du brief auto
  const lines = [`# Contexte du dossier — avant de lancer ${analysisName}\n`];
  lines.push("Un expert-comptable n'analyse pas un dossier sans connaître son activité. J'ai récupéré ce que je peux côté Pennylane et données publiques — confirme-moi en 1 phrase si tu vois des particularités à connaître, et je lance l'analyse.\n");

  lines.push('## Auto-détecté\n');
  if (pn?.companyName) lines.push(`- **Dossier Pennylane** : ${pn.companyName}`);
  if (pn?.siren) lines.push(`- **SIREN** : ${pn.siren}${pn.siret ? ` (SIRET ${pn.siret})` : ''}`);
  if (gv?.nom_complet && gv.nom_complet !== pn?.companyName) lines.push(`- **Raison sociale (RNE)** : ${gv.nom_complet}`);
  if (gv?.nature_juridique) lines.push(`- **Forme juridique** : ${gv.nature_juridique}`);
  if (gv?.activite_principale) {
    const naf = gv.activite_principale;
    const label = gv.libelle_activite || '';
    lines.push(`- **Activité (NAF)** : \`${naf}\` ${label ? `— ${label}` : ''}`);
  }
  if (hint) lines.push(`- **Lecture cabinet (auto)** : ${hint}`);
  if (gv?.tranche_effectifs) lines.push(`- **Effectif** : ${gv.tranche_effectifs}`);
  if (gv?.date_creation) lines.push(`- **Créée le** : ${gv.date_creation}`);
  if (gv?.siege_commune) lines.push(`- **Siège** : ${gv.siege_commune}`);

  if (!gv && !pn?.siren) {
    lines.push('- *(SIREN non trouvé dans Pennylane — vérifie que la fiche entreprise est complète : Pennylane → Paramètres → Informations entreprise)*');
  }
  if (pn?.siren && !gv) {
    lines.push(`- *(SIREN ${pn.siren} non trouvé en open data publique — peut être une entité étrangère, en cours d'immatriculation, ou avec restriction de diffusion)*`);
  }

  lines.push("\n## Avant de continuer\n");
  lines.push("Confirme-moi, en 1-3 phrases :");
  lines.push("");
  lines.push(`1. **L'activité ci-dessus est-elle exacte ?** ${hint ? `(Je vais analyser avec l'hypothèse : ${hint.split(' (')[0].toLowerCase()})` : '(Décris-moi en une phrase ce que fait l\'entreprise)'}`);
  lines.push(`2. **Pour ${period}** — c'est une période normale, forte, ou faible pour le dossier ? (si saisonnalité)`);
  lines.push(`3. **Particularités cabinet à connaître** — multi-établissements ? TVA encaissement ? Refacturations intra-groupe ? Promo ou évènement ponctuel ? Saisie complète sur la période ?`);
  lines.push('');
  lines.push("**Réponds en texte libre, je relance immédiatement avec ton contexte.** Si tout te paraît bon en l'état, tape simplement « ok va, particularités : [tes notes] » ou « ok, rien de particulier ».");

  return lines.join('\n');
}
