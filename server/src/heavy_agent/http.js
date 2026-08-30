import { logger } from "../lib/logger.js";

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
export const DEFAULT_MAX_RETRIES = 2;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const lastRequestAt = new Map();

export async function throttle(source, minIntervalMs) {
  const now = Date.now();
  const last = lastRequestAt.get(source) ?? 0;
  const wait = minIntervalMs - (now - last);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestAt.set(source, Date.now());
}

export async function fetchWithRetry(
  url,
  options = {},
  {
    source,
    query,
    maxRetries = DEFAULT_MAX_RETRIES,
    minIntervalMs = 0,
    parseResponse,
  } = {}
) {
  if (minIntervalMs > 0) {
    await throttle(source, minIntervalMs);
  }

  let lastError;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
      });
      const latencyMs = Date.now() - start;
      lastStatus = response.status;

      if (!response.ok) {
        logger.externalCall({
          source,
          query: query ?? url,
          status: response.status,
          latencyMs,
          success: false,
          error: `HTTP ${response.status}`,
        });

        if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxRetries) {
          const body = parseResponse
            ? await parseResponse(response).catch(() => null)
            : await response.text().catch(() => null);
          return {
            ok: false,
            status: response.status,
            body,
            latencyMs,
            attempts: attempt + 1,
            error: `HTTP ${response.status}`,
          };
        }

        const backoffMs = response.status === 429 ? 1500 * 2 ** attempt : 500 * 2 ** attempt;
        await sleep(backoffMs);
        continue;
      }

      const body = parseResponse
        ? await parseResponse(response)
        : await response.text();

      logger.externalCall({
        source,
        query: query ?? url,
        status: response.status,
        latencyMs,
        success: true,
      });

      return { ok: true, status: response.status, body, latencyMs, attempts: attempt + 1 };
    } catch (error) {
      const latencyMs = Date.now() - start;
      lastError = error;

      logger.externalCall({
        source,
        query: query ?? url,
        status: lastStatus || 500,
        latencyMs,
        success: false,
        error,
      });

      if (attempt === maxRetries) {
        return {
          ok: false,
          status: lastStatus || 500,
          body: null,
          latencyMs,
          attempts: attempt + 1,
          error: error.message,
        };
      }

      await sleep(500 * 2 ** attempt);
    }
  }

  return {
    ok: false,
    status: lastStatus || 500,
    body: null,
    latencyMs: 0,
    attempts: maxRetries + 1,
    error: lastError?.message ?? "Unknown fetch error",
  };
}
