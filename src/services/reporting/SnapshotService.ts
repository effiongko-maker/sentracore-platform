import type { ReportingSnapshot } from "./types";

const TTL_MS = 60_000;

export interface CachedReportingSnapshot {
  snapshot: ReportingSnapshot;
  generatedAt: string;
  expiresAt: string;
  version: number;
}

export interface SnapshotCacheMetadata {
  generatedAt: string;
  expiresAt: string;
  version: number;
}

interface CacheEntry {
  cached: CachedReportingSnapshot | null;
  building: Promise<ReportingSnapshot> | null;
}

/**
 * In-memory ReportingSnapshot cache beneath ReportingService.
 * No Dashboard types. No domain service calls.
 */
const entries = new Map<string, CacheEntry>();
let globalVersion = 0;
let lastMetadata: SnapshotCacheMetadata | null = null;

function normalizeKey(cacheKey: string): string {
  return cacheKey || "__default__";
}

function isExpired(cached: CachedReportingSnapshot, now = Date.now()): boolean {
  return Date.parse(cached.expiresAt) <= now;
}

export const SnapshotService = {
  /**
   * Return a valid cached snapshot or rebuild via `build`.
   * Concurrent callers for the same key share one rebuild Promise.
   */
  async getOrCreate(
    cacheKey: string,
    build: () => Promise<ReportingSnapshot>
  ): Promise<ReportingSnapshot> {
    const key = normalizeKey(cacheKey);
    let entry = entries.get(key);

    if (entry?.building) {
      return entry.building;
    }

    if (entry?.cached && !isExpired(entry.cached)) {
      return entry.cached.snapshot;
    }

    if (!entry) {
      entry = { cached: null, building: null };
      entries.set(key, entry);
    }

    const building = (async () => {
      try {
        const snapshot = await build();
        const generatedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
        globalVersion += 1;

        const cached: CachedReportingSnapshot = {
          snapshot,
          generatedAt,
          expiresAt,
          version: globalVersion,
        };

        lastMetadata = {
          generatedAt,
          expiresAt,
          version: globalVersion,
        };

        const current = entries.get(key);
        if (current) {
          current.cached = cached;
          current.building = null;
        }

        return snapshot;
      } catch (error) {
        const current = entries.get(key);
        if (current) current.building = null;
        console.warn(
          "[snapshot] rebuild failed",
          error instanceof Error ? error.message : error
        );
        throw error;
      }
    })();

    entry.building = building;
    return building;
  },

  /** Clear all cached snapshots. Future CRUD will call after mutations. */
  invalidate(): void {
    entries.clear();
    lastMetadata = null;
  },

  /** Read-only cache metadata for the last successful rebuild (any key). */
  getMetadata(): SnapshotCacheMetadata | null {
    return lastMetadata;
  },

  /** Read-only metadata for a specific cache key, if present. */
  getMetadataFor(cacheKey: string): SnapshotCacheMetadata | null {
    const entry = entries.get(normalizeKey(cacheKey));
    if (!entry?.cached) return null;
    return {
      generatedAt: entry.cached.generatedAt,
      expiresAt: entry.cached.expiresAt,
      version: entry.cached.version,
    };
  },

  /** Current TTL in milliseconds. */
  getTtlMs(): number {
    return TTL_MS;
  },
};

export type ISnapshotService = typeof SnapshotService;
