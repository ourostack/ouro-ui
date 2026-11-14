// Retries a fetch from raw.githubusercontent.com on its own, so one dropped request costs one retry.
// shadcn add fetches each file of a release with the global fetch; the preload
// (raw-fetch-retry-preload.mjs) wraps it for that shadcn process only.
import { setTimeout as sleepFor } from "node:timers/promises";
import { URL } from "node:url";

export const RAW_HOST = "raw.githubusercontent.com";

/** Waits before the 2nd, 3rd and 4th tries. */
export const RETRY_DELAYS_MS = [500, 1500, 4000];

const retriableStatus = (status) => status === 429 || status >= 500;

function reasonOf(error) {
  return String(error.cause?.code ?? error.cause?.message ?? error.message ?? error);
}

function urlOf(input) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(href);
  } catch {
    return undefined;
  }
}

/**
 * Wraps `fetchImpl` so a request to one of `hosts` is tried again after a network error, a 429 or a 5xx.
 * A 404 and other non-retriable statuses return at once. After the last try, the last error is thrown
 * and the last response is returned, so the caller reports the failure it always did.
 */
export function withRetry(fetchImpl, { hosts = [RAW_HOST], delays = RETRY_DELAYS_MS, log = () => {}, sleep = sleepFor } = {}) {
  const tries = delays.length + 1;
  return async function retryingFetch(input, init) {
    const url = urlOf(input);
    if (!url || !hosts.includes(url.hostname)) return fetchImpl(input, init);
    for (let attempt = 1; ; attempt++) {
      let reason;
      try {
        const response = await fetchImpl(input, init);
        if (!retriableStatus(response.status) || attempt === tries) return response;
        reason = `HTTP ${response.status}`;
        response.body?.cancel().catch(() => {});
      } catch (error) {
        if (attempt === tries || init?.signal?.aborted) throw error;
        reason = reasonOf(error);
      }
      const delay = delays[attempt - 1];
      log(`raw-fetch-retry: ${url.pathname} failed (${reason}); try ${attempt + 1} of ${tries} in ${delay / 1000}s`);
      await sleep(delay);
    }
  };
}
