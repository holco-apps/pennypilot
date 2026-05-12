// PennyPilot — Vérification de la clé HOLCO.
//
// Au démarrage, vérifie que la HOLCO_LICENSE_KEY (saisie par l'utilisateur à
// l'installation) est listée dans le registre public des clés valides hébergé
// par HOLCO. Cache local 7 jours pour résilience offline.
//
// Architecture :
//   - Registre public  : GET https://apps.holco.co/api/licenses.json
//                        Format : { version: 1, valid_hashes: ["sha256...", ...] }
//   - La clé en clair n'est jamais envoyée. Seul son hash SHA-256 est comparé.
//   - Cache local      : ~/.pennypilot/license-cache.json
//   - TTL valide       : 7 jours (résilient si apps.holco.co momentanément KO)
//   - Pas de cache des invalides (re-check à chaque démarrage si refus).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LICENSES_URL = 'https://apps.holco.co/api/licenses.json';
const CACHE_PATH = path.join(os.homedir(), '.pennypilot', 'license-cache.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const FETCH_TIMEOUT_MS = 10_000;

function hashKey(key) {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(cache) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    // Cache écriture non-bloquante (filesystem readonly possible)
    console.error('[PennyPilot] cache write failed (non-fatal):', err.message);
  }
}

async function fetchLicenseHashes() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(LICENSES_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PennyPilot/0.2.0 (HOLCO; https://holco.co)',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data.valid_hashes)) {
      throw new Error('format licenses.json invalide (valid_hashes manquant)');
    }
    return data.valid_hashes;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`timeout ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

/**
 * Vérifie la HOLCO_LICENSE_KEY. Lève une erreur explicite si invalide / absente / serveur HOLCO down sans cache valide.
 * À appeler au démarrage du serveur MCP.
 */
export async function assertHolcoLicense() {
  // Dev mode : bypass complet (à utiliser uniquement par HOLCO en local pour les tests).
  // Ne JAMAIS exposer cette variable dans le manifest .mcpb distribué.
  if (process.env.PENNYPILOT_BYPASS_LICENSE === '1') {
    console.error('[PennyPilot] ⚠ DEV MODE : license check bypassed (PENNYPILOT_BYPASS_LICENSE=1).');
    return;
  }

  const key = process.env.HOLCO_LICENSE_KEY;
  if (!key) {
    throw new Error(
      'HOLCO_LICENSE_KEY absente. Inscris-toi sur https://apps.holco.co/mcp/pennylane/start pour recevoir ta clé HOLCO par email.'
    );
  }

  // Format léger (sanity check) : la clé contient "HOLCO-" et fait au moins 15 caractères
  const trimmed = key.trim();
  if (!/^HOLCO-/.test(trimmed) || trimmed.length < 15) {
    throw new Error(
      `Clé HOLCO mal formée. Format attendu : HOLCO-XXXX-XXXX-XXXX-XXXX. Reçu : "${trimmed.slice(0, 10)}...".`
    );
  }

  const keyHash = hashKey(trimmed);

  // Try cache d'abord (mode rapide)
  const cache = readCache();
  if (
    cache &&
    cache.key_hash === keyHash &&
    cache.valid === true &&
    typeof cache.validated_at === 'number' &&
    Date.now() - cache.validated_at < CACHE_TTL_MS
  ) {
    return; // cache valide, on ne fait pas l'appel réseau
  }

  // Fetch le registre HOLCO public
  let validHashes;
  try {
    validHashes = await fetchLicenseHashes();
  } catch (err) {
    // apps.holco.co inaccessible : mode dégradé si on avait un cache valide même expiré
    if (cache && cache.key_hash === keyHash && cache.valid === true) {
      console.error(
        `[PennyPilot] licenses.json inaccessible (${err.message}), validation depuis le cache local.`
      );
      return;
    }
    throw new Error(
      `Impossible de vérifier la clé HOLCO (apps.holco.co inaccessible : ${err.message}). Vérifie ta connexion internet, ou contacte alan@holco.co.`
    );
  }

  if (validHashes.includes(keyHash)) {
    writeCache({ key_hash: keyHash, valid: true, validated_at: Date.now() });
    return;
  }

  // Clé non listée → invalide ou révoquée
  throw new Error(
    `Clé HOLCO invalide ou révoquée. Vérifie la clé reçue par email, ou contacte alan@holco.co pour réactiver l'accès.`
  );
}
