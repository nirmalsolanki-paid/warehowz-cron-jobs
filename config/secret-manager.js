'use strict';

/**
 * GCP Secret Manager loader — production only.
 *
 * This cron-service is deployed as a standalone production-only service (no
 * staging variant), so unlike the main app's config/secret-manager.js (which
 * reads project `warehowz-dev` / secret `ENV_STAGING`), this reads the
 * dedicated production secret directly: project `warehowz-prod`, secret
 * `ENV_PRODUCTION`.
 *
 * Fetches the secret (stored as a .env-formatted string) and parses it into a
 * plain key/value object. Results are cached in-process for CACHE_TTL_MS
 * milliseconds so that hot-reload scenarios or multiple callers don't hammer
 * the Secret Manager API.
 *
 * Authentication (pick one):
 *   - Cloud Run / GCE / GKE: attach a Service Account with the
 *     "Secret Manager Secret Accessor" role on the `warehowz-prod` project —
 *     no extra config needed.
 *   - Local development: run `gcloud auth application-default login` OR
 *     set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 */

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

// ── Config ────────────────────────────────────────────────────────────────────
const PROJECT_ID = 'warehowz-prod';
const SECRET_NAME = 'ENV_PRODUCTION';
const SECRET_PATH = `projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest`;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Singleton client ──────────────────────────────────────────────────────────
let _client = null;
function getClient() {
  if (!_client) _client = new SecretManagerServiceClient();

  return _client;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;

function isCacheValid() {
  return _cache !== null && Date.now() - _cacheAt < CACHE_TTL_MS;
}

// ── .env string parser ────────────────────────────────────────────────────────
function parseEnvString(raw) {
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) env[key] = value;
  }

  return env;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns an object of key/value pairs parsed from the ENV_STAGING secret.
 *
 * @param {object}  [options]
 * @param {boolean} [options.forceRefresh=false]  Bypass cache and re-fetch.
 * @returns {Promise<Record<string, string>>}
 */
async function getEnvFromSecretManager({ forceRefresh = false } = {}) {
  if (!forceRefresh && isCacheValid()) {
    return _cache;
  }

  let version;
  try {
    [version] = await getClient().accessSecretVersion({ name: SECRET_PATH });
  } catch (err) {
    throw new Error(
      `[SecretManager] Could not access secret "${SECRET_NAME}" (path: ${SECRET_PATH}): ${err.message}`
    );
  }

  if (!version?.payload?.data) {
    throw new Error(
      `[SecretManager] Secret "${SECRET_NAME}" returned an empty payload. ` +
        'Ensure the secret has at least one active version.'
    );
  }

  const raw = version.payload.data.toString('utf8');
  const parsed = parseEnvString(raw);

  if (Object.keys(parsed).length === 0) {
    console.warn(
      `[SecretManager] Warning: secret "${SECRET_NAME}" was fetched but contained no parseable key=value pairs.`
    );
  }

  _cache = parsed;
  _cacheAt = Date.now();

  return _cache;
}

/**
 * Invalidates the in-process cache, forcing the next call to re-fetch.
 * Useful in tests or if you know the secret was rotated.
 */
function clearCache() {
  _cache = null;
  _cacheAt = 0;
}

module.exports = { getEnvFromSecretManager, clearCache };
