/**
 * Shared in-flight coalescing + optional short-TTL cache.
 *
 * - Identical concurrent loaders share one Promise.
 * - Failures clear the in-flight entry (retry allowed; failures are not cached).
 * - Successful results may be TTL-cached when ttlMs > 0.
 * - invalidateSharedRequests drops cache + in-flight for matching keys.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const inflight = new Map<string, Promise<unknown>>();
const cache = new Map<string, CacheEntry<unknown>>();

/** Reference catalog TTL — aligned with SnapshotService (60s). */
export const CATALOG_TTL_MS = 60_000;

/** Short TTL for derived operational workload maps (not long-lived). */
export const WORKLOAD_TTL_MS = 30_000;

export type SharedRequestOptions = {
  /** When > 0, successful results are reused until expiry. Default 0 (inflight only). */
  ttlMs?: number;
};

export async function sharedRequest<T>(
  key: string,
  loader: () => Promise<T>,
  options: SharedRequestOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? 0;
  const now = Date.now();

  if (ttlMs > 0) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.value as T;
    }
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const run = (async () => {
    try {
      const value = await loader();
      if (ttlMs > 0) {
        cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      } else {
        cache.delete(key);
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, run);
  return run;
}

/** Drop cached + in-flight entries whose key equals or starts with `keyOrPrefix`. */
export function invalidateSharedRequests(keyOrPrefix: string): void {
  for (const key of [...inflight.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      inflight.delete(key);
    }
  }
  for (const key of [...cache.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      cache.delete(key);
    }
  }
}

/** Stable identity for list/query payloads (sorted object keys). */
export function stableRequestKey(
  namespace: string,
  identity: Record<string, unknown> | string | number | boolean | null | undefined
): string {
  if (identity == null || typeof identity !== "object") {
    return `${namespace}:${String(identity ?? "")}`;
  }
  return `${namespace}:${stableStringify(identity)}`;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

/** Test/diagnostics helpers — not for product UI. */
export function sharedRequestDiagnostics() {
  return {
    inflight: inflight.size,
    cache: cache.size,
    keys: {
      inflight: [...inflight.keys()],
      cache: [...cache.keys()],
    },
  };
}
