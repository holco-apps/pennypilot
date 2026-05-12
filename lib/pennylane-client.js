// Client HTTP léger pour l'API Pennylane v2.
// Doc : https://pennylane.readme.io/
// Auth : Authorization: Bearer <PENNYLANE_TOKEN>
// Pagination v2 (2026) : cursor-based avec `cursor` + `limit`.
// Header opt-in 2026 (X-Use-2026-API-Changes: true) : stabilité défensive,
// force le nouveau comportement même si Pennylane changeait ses defaults.

const BASE_URL = 'https://app.pennylane.com/api/external/v2';
const USER_AGENT = 'PennyPilot/0.2.0 (HOLCO; https://holco.co)';
const MAX_RETRY = 3;
const FETCH_TIMEOUT_MS = 30000; // 30s par tentative

function getToken() {
  const t = process.env.PENNYLANE_TOKEN;
  if (!t) {
    throw new Error(
      'PENNYLANE_TOKEN absent. Crée un fichier .env avec PENNYLANE_TOKEN=<ton_token> ou démarre avec `node --env-file=.env`.'
    );
  }
  return t;
}

/** True si le statut HTTP justifie un retry (rate limit ou erreur serveur). */
function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

/** Convertit une erreur HTTP Pennylane en message actionnable pour l'utilisateur cabinet. */
function humanizeError(status, text, url) {
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
 * Appel HTTP générique avec timeout 30s, retry exponentiel sur 429 et 5xx.
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
  // Auto-set Content-Type: application/json, sauf FormData (multipart)
  if (
    options.body &&
    !headers['Content-Type'] &&
    !(options.body instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  let attempt = 0;
  while (true) {
    // Timeout 30s par tentative via AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, { ...options, headers, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeoutId);
      // Timeout = AbortError, retryable comme un 5xx
      if (err.name === 'AbortError') {
        if (attempt < MAX_RETRY) {
          console.error(
            `[Pennylane] Timeout après ${FETCH_TIMEOUT_MS}ms, retry (tentative ${attempt + 1}/${MAX_RETRY})`
          );
          attempt++;
          continue;
        }
        throw new Error(
          `Pennylane n'a pas répondu après ${MAX_RETRY} tentatives de ${FETCH_TIMEOUT_MS / 1000}s. Réessaie dans quelques minutes.`
        );
      }
      // Autre erreur réseau : remonter
      throw new Error(`Pennylane réseau : ${err.message}`);
    }
    clearTimeout(timeoutId);

    // Retry sur 429 + 5xx
    if (isRetryableStatus(res.status) && attempt < MAX_RETRY) {
      const retryAfter =
        Number(res.headers.get('retry-after')) || Math.pow(2, attempt);
      const reason = res.status === 429 ? 'rate limited' : 'server error';
      console.error(
        `[Pennylane] HTTP ${res.status} ${reason}, retry dans ${retryAfter}s (tentative ${attempt + 1}/${MAX_RETRY})`
      );
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

/** Test de santé : retourne user + company + scopes. */
export async function getMe() {
  return pnlFetch('/me');
}
