// Client HTTP pour l'API Pennylane Company v2.
// Doc : https://pennylane.readme.io/
// Auth : Authorization: Bearer <PENNYLANE_TOKEN>
// Pagination 2026 : cursor-based via `cursor` + `limit`.
// Header X-Use-2026-API-Changes: stabilité défensive contre les changements de defaults.

import { USER_AGENT } from './version.js';
import { log } from './logger.js';

const BASE_URL = 'https://app.pennylane.com/api/external/v2';
const MAX_RETRY = 3;
const FETCH_TIMEOUT_MS = 30000;

function getToken() {
  const t = process.env.PENNYLANE_TOKEN;
  if (!t) {
    throw new Error(
      'PENNYLANE_TOKEN absent. Crée un fichier .env avec PENNYLANE_TOKEN=<ton_token> ou démarre avec `node --env-file=.env`.'
    );
  }
  return t;
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

export function humanizeError(status, text, url) {
  if (status === 400) {
    return `Pennylane HTTP 400 — Requête mal formée (${url}). Détails : ${text}`;
  }
  if (status === 401) {
    return `Pennylane HTTP 401 — Token invalide ou expiré. Régénère-le dans Pennylane via Paramètres > Connectivité > Développeurs, puis réinstalle l'extension.`;
  }
  if (status === 403) {
    return `Pennylane HTTP 403 — Token sans scopes suffisants pour cet endpoint (${url}). Vérifie les permissions du token Pennylane.`;
  }
  if (status === 404) {
    return `Pennylane HTTP 404 — Ressource introuvable (${url}). Si la ressource existe pourtant dans Pennylane, l'API a peut-être changé.`;
  }
  if (status === 422) {
    return `Pennylane HTTP 422 — Requête invalide. Détails : ${text}`;
  }
  if (status >= 500) {
    return `Pennylane temporairement indisponible (HTTP ${status}). Réessaie dans quelques minutes. ${text}`;
  }
  return `Pennylane HTTP ${status} ${url} — ${text}`;
}

/**
 * Appel HTTP générique avec timeout 30s et retry exponentiel sur 429 / 5xx.
 * @param {string} path - chemin sous /api/external/v2 (ex: '/me', '/customer_invoices?limit=20')
 * @param {object} [options] - fetch options (method, body, headers...)
 */
export async function pnlFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    'X-Use-2026-API-Changes': 'true',
    ...(options.headers || {}),
  };
  if (
    options.body &&
    !headers['Content-Type'] &&
    !(options.body instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (attempt < MAX_RETRY) {
          log.warn('pennylane.timeout', { url, attempt: attempt + 1, maxRetry: MAX_RETRY, timeoutMs: FETCH_TIMEOUT_MS });
          attempt++;
          continue;
        }
        throw new Error(
          `Pennylane n'a pas répondu après ${MAX_RETRY} tentatives de ${FETCH_TIMEOUT_MS / 1000}s. Réessaie dans quelques minutes.`
        );
      }
      throw new Error(`Pennylane réseau : ${err.message}`);
    }
    clearTimeout(timeoutId);

    if (isRetryableStatus(res.status) && attempt < MAX_RETRY) {
      const retryAfter =
        Number(res.headers.get('retry-after')) || Math.pow(2, attempt);
      log.warn('pennylane.retry', { url, status: res.status, retryAfterSec: retryAfter, attempt: attempt + 1, maxRetry: MAX_RETRY });
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      attempt++;
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(humanizeError(res.status, text, url));
    }

    return res.json();
  }
}

/**
 * Itérateur de pagination cursor-based. Yields chaque item de chaque page.
 * Throw si maxPages atteint sans `has_more=false` — évite la troncature silencieuse.
 *
 * @param {string} path - chemin avec ou sans query existante (limit/cursor ajoutés automatiquement)
 * @param {{limit?: number, maxPages?: number}} [opts]
 */
export async function* paginate(path, opts = {}) {
  const limit = opts.limit ?? 100;
  const maxPages = opts.maxPages ?? 200;
  const sep = path.includes('?') ? '&' : '?';
  let cursor = null;

  for (let page = 0; page < maxPages; page++) {
    const url = `${path}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await pnlFetch(url);
    for (const item of data.items || []) yield item;
    if (!data.has_more) return;
    cursor = data.next_cursor;
  }

  throw new Error(
    `paginate(${path}) a atteint maxPages=${maxPages} (limit=${limit}). Affiner le filtre côté requête, ou augmenter maxPages.`
  );
}

/** Helper : collecte tous les items en mémoire. À éviter sur les endpoints très larges. */
export async function paginateAll(path, opts) {
  const all = [];
  for await (const item of paginate(path, opts)) all.push(item);
  return all;
}

/** Test de santé : retourne user + company + scopes. */
export async function getMe() {
  return pnlFetch('/me');
}
