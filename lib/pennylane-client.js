// Client HTTP pour l'API Pennylane Company v2.
// Doc : https://pennylane.readme.io/
// Auth : Authorization: Bearer <PENNYLANE_TOKEN>
// Pagination 2026 : cursor-based via `cursor` + `limit`.
// Header X-Use-2026-API-Changes: stabilité défensive contre les changements de defaults.
//
// Trois propriétés à retenir :
//   - In-flight dedup : si 3 tools demandent /me en parallèle, 1 seul HTTP.
//   - Concurrency gate : au plus N requêtes en vol simultanément (politesse API).
//   - Request-ID : un identifiant client est généré et propagé via X-Request-Id ;
//     l'identifiant serveur Pennylane (si présent) est capturé pour les logs + erreurs,
//     permettant à un support ticket de tracer une requête exacte.

import crypto from 'node:crypto';
import { USER_AGENT } from './version.js';
import { log } from './logger.js';

const BASE_URL = 'https://app.pennylane.com/api/external/v2';
const MAX_RETRY = 3;
const FETCH_TIMEOUT_MS = 30000;
const MAX_CONCURRENT = 4;
// Headers Pennylane potentiellement émis pour l'ID serveur (on capture le premier non-vide).
const SERVER_REQ_ID_HEADERS = ['x-request-id', 'x-pennylane-request-id', 'request-id', 'x-trace-id'];

// ---------------------------------------------------------------------------
// READ_ONLY_GUARD
// ---------------------------------------------------------------------------
// PennyPilot est en lecture seule par design. Toute méthode HTTP autre que GET
// ou HEAD vers l'API Pennylane est refusée AVANT d'atteindre le réseau.
//
// Cette barrière protège un cabinet contre :
//   - un bug d'un futur outil interne qui tenterait par erreur d'écrire
//   - un changement involontaire d'une dépendance
//   - un fork modifié qui tenterait de réutiliser ce client
//
// Vérifiable publiquement :
//   https://github.com/holco-apps/pennypilot/blob/main/lib/pennylane-client.js
//
// Si HOLCO ajoute un jour des outils d'écriture, ce sera dans un module
// distinct clairement nommé (ex: `pennylane-writer.js`), avec consentement
// explicite côté cabinet — jamais en relâchant cette garde.
const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

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

function newClientReqId() {
  return `pp-${crypto.randomBytes(6).toString('hex')}`;
}

function pickServerReqId(headers) {
  if (!headers || typeof headers.get !== 'function') return null;
  for (const name of SERVER_REQ_ID_HEADERS) {
    const v = headers.get(name);
    if (v) return v;
  }
  return null;
}

export function humanizeError(status, text, url, ids = {}) {
  const trace = ids.serverReqId
    ? `\n\nIdentifiants de trace (à fournir au support Pennylane si besoin) : client=${ids.clientReqId} · serveur=${ids.serverReqId}`
    : ids.clientReqId
      ? `\n\nIdentifiant de trace client : ${ids.clientReqId} (le serveur Pennylane n'a pas renvoyé d'identifiant)`
      : '';
  if (status === 400) {
    return `Pennylane HTTP 400 — Requête mal formée (${url}). Détails : ${text}${trace}`;
  }
  if (status === 401) {
    return `Pennylane HTTP 401 — Token invalide ou expiré. Régénère-le dans Pennylane via Paramètres > Connectivité > Développeurs, puis réinstalle l'extension.${trace}`;
  }
  if (status === 403) {
    return `Pennylane HTTP 403 — Token sans scopes suffisants pour cet endpoint (${url}). Vérifie les permissions du token Pennylane.${trace}`;
  }
  if (status === 404) {
    return `Pennylane HTTP 404 — Ressource introuvable (${url}). Si la ressource existe pourtant dans Pennylane, l'API a peut-être changé.${trace}`;
  }
  if (status === 422) {
    return `Pennylane HTTP 422 — Requête invalide. Détails : ${text}${trace}`;
  }
  if (status >= 500) {
    return `Pennylane temporairement indisponible (HTTP ${status}). Réessaie dans quelques minutes. ${text}${trace}`;
  }
  return `Pennylane HTTP ${status} ${url} — ${text}${trace}`;
}

// ---------------------------------------------------------------------------
// Concurrency gate : au plus MAX_CONCURRENT requêtes simultanées.
// ---------------------------------------------------------------------------

let activeCount = 0;
const waiters = [];

async function acquireSlot() {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) next();
  else activeCount--;
}

// ---------------------------------------------------------------------------
// In-flight dedup : même URL+méthode → même Promise (uniquement GET sans body).
// ---------------------------------------------------------------------------

const inFlight = new Map();

function dedupKey(url, options) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' || options.body) return null; // pas de dedup sur écriture
  return `${method} ${url}`;
}

// ---------------------------------------------------------------------------
// pnlFetch
// ---------------------------------------------------------------------------

/**
 * Appel HTTP générique avec timeout 30s, retry exponentiel sur 429 / 5xx,
 * in-flight dedup sur GETs, et concurrency gate global.
 *
 * @param {string} path - chemin sous /api/external/v2 (ex: '/me', '/customer_invoices?limit=20')
 * @param {object} [options] - fetch options (method, body, headers…)
 * @returns {Promise<any>} JSON parsé. Erreur typée si HTTP non-OK ou réseau.
 */
export function pnlFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (!READ_ONLY_METHODS.has(method)) {
    return Promise.reject(
      new Error(
        `READ_ONLY_GUARD: PennyPilot est en lecture seule par design. ` +
        `Méthode HTTP "${method}" refusée pour ${path}. ` +
        `Voir lib/pennylane-client.js (READ_ONLY_GUARD) — aucune requête n'a été émise.`
      )
    );
  }
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const key = dedupKey(url, options);
  if (key && inFlight.has(key)) {
    return inFlight.get(key);
  }
  const promise = doFetch(url, options).finally(() => {
    if (key) inFlight.delete(key);
  });
  if (key) inFlight.set(key, promise);
  return promise;
}

async function doFetch(url, options) {
  const clientReqId = newClientReqId();
  const headers = {
    Authorization: `Bearer ${getToken()}`,
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    'X-Use-2026-API-Changes': 'true',
    'X-Request-Id': clientReqId,
    ...(options.headers || {}),
  };
  if (
    options.body &&
    !headers['Content-Type'] &&
    !(options.body instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  await acquireSlot();
  try {
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
            log.warn('pennylane.timeout', { url, clientReqId, attempt: attempt + 1, maxRetry: MAX_RETRY, timeoutMs: FETCH_TIMEOUT_MS });
            attempt++;
            continue;
          }
          throw new Error(
            `Pennylane n'a pas répondu après ${MAX_RETRY} tentatives de ${FETCH_TIMEOUT_MS / 1000}s (client req-id ${clientReqId}). Réessaie dans quelques minutes.`
          );
        }
        throw new Error(`Pennylane réseau (client req-id ${clientReqId}) : ${err.message}`);
      }
      clearTimeout(timeoutId);

      const serverReqId = pickServerReqId(res.headers);

      if (isRetryableStatus(res.status) && attempt < MAX_RETRY) {
        const retryAfter =
          Number(res.headers.get('retry-after')) || Math.pow(2, attempt);
        log.warn('pennylane.retry', { url, status: res.status, clientReqId, serverReqId, retryAfterSec: retryAfter, attempt: attempt + 1, maxRetry: MAX_RETRY });
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        attempt++;
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        log.warn('pennylane.error', { url, status: res.status, clientReqId, serverReqId });
        throw new Error(humanizeError(res.status, text, url, { clientReqId, serverReqId }));
      }

      log.debug('pennylane.ok', { url, status: res.status, clientReqId, serverReqId });
      return res.json();
    }
  } finally {
    releaseSlot();
  }
}

// ---------------------------------------------------------------------------
// Pagination cursor-based (générateur async, sans buffer mémoire).
// ---------------------------------------------------------------------------

/**
 * Itérateur de pagination cursor-based. Yields chaque item de chaque page.
 * Throw si maxPages atteint sans `has_more=false` — évite la troncature silencieuse.
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

// ---------------------------------------------------------------------------
// FluentAsync : pipeline lazy sur un AsyncIterable.
// Permet l'écriture déclarative côté tools :
//   await stream('/customer_invoices')
//     .filter(inv => !inv.paid && inv.deadline < today)
//     .take(20)
//     .toArray();
// Sur un dossier 50k factures, ne charge que les pages nécessaires.
// ---------------------------------------------------------------------------

export class FluentAsync {
  constructor(source) {
    this.source = source;
  }

  filter(fn) {
    const src = this.source;
    return new FluentAsync((async function* () {
      for await (const x of src) if (fn(x)) yield x;
    })());
  }

  map(fn) {
    const src = this.source;
    return new FluentAsync((async function* () {
      for await (const x of src) yield fn(x);
    })());
  }

  take(n) {
    const src = this.source;
    return new FluentAsync((async function* () {
      if (n <= 0) return;
      // Iteration manuelle (et non for-await) pour éviter le pull
      // surnuméraire que ferait le for-await après le n-ème yield.
      const it = src[Symbol.asyncIterator]();
      try {
        for (let i = 0; i < n; i++) {
          const { value, done } = await it.next();
          if (done) return;
          yield value;
        }
      } finally {
        if (typeof it.return === 'function') await it.return();
      }
    })());
  }

  async toArray() {
    const out = [];
    for await (const x of this.source) out.push(x);
    return out;
  }

  async reduce(fn, init) {
    let acc = init;
    for await (const x of this.source) acc = fn(acc, x);
    return acc;
  }

  async first() {
    for await (const x of this.source) return x;
    return undefined;
  }

  async count() {
    let n = 0;
    for await (const _ of this.source) n++; // eslint-disable-line no-unused-vars
    return n;
  }

  [Symbol.asyncIterator]() {
    return this.source[Symbol.asyncIterator]();
  }
}

/** Démarre un pipeline lazy sur un endpoint paginé. */
export function stream(path, opts) {
  return new FluentAsync(paginate(path, opts));
}

/** Test de santé : retourne user + company + scopes. */
export async function getMe() {
  return pnlFetch('/me');
}
