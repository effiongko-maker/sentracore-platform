import { traceRequest } from "@/services/debug/requestTrace";
import {
  getEntityRegistration,
  listEntityRegistrations,
  registerEntityResolver,
} from "./registry";
import { EntityKinds, registerDefaultEntityResolvers } from "./registrations";
import type { EntityKind, ResolvedEntity } from "./types";

registerDefaultEntityResolvers();

/** In-memory id → name per kind. */
const directories = new Map<EntityKind, Map<string, string>>();

/** In-flight directory loads (dedupe concurrent warm-ups). */
const inflight = new Map<EntityKind, Promise<Map<string, string>>>();

function normalizeId(id: string | null | undefined): string {
  return String(id ?? "").trim();
}

async function ensureDirectory(kind: EntityKind): Promise<Map<string, string>> {
  const cached = directories.get(kind);
  if (cached) {
    console.log(
      `[hang] EntityResolver.ensureDirectory(${kind}) CACHE HIT size=${cached.size}`
    );
    return cached;
  }

  const pending = inflight.get(kind);
  if (pending) {
    console.log(
      `[hang] EntityResolver.ensureDirectory(${kind}) JOIN in-flight`
    );
    return pending;
  }

  const registration = getEntityRegistration(kind);
  if (!registration) {
    const empty = new Map<string, string>();
    directories.set(kind, empty);
    return empty;
  }

  const load = traceRequest(`EntityResolver.loadDirectory(${kind})`, () =>
    registration
      .loadDirectory()
      .then((map) => {
        directories.set(kind, map);
        inflight.delete(kind);
        return map;
      })
      .catch((error) => {
        inflight.delete(kind);
        // Graceful: leave empty directory so callers get id fallback.
        directories.set(kind, new Map());
        console.error(
          `[EntityResolver] Failed to load directory for "${kind}":`,
          error
        );
        return directories.get(kind)!;
      })
  );

  inflight.set(kind, load);
  return load;
}

/**
 * Shared Entity Resolver.
 *
 * Resolves canonical entity IDs (USR-*, FAC-*, AST-*, …) into display names
 * via registered domain services. Open for extension: register a new kind
 * without modifying this file.
 *
 * Missing / unknown records fall back to the raw id — never throw.
 */
export const EntityResolver = {
  /** Plugin registration (also used by future modules). */
  register: registerEntityResolver,

  /** Stable built-in kind constants. */
  kinds: EntityKinds,

  /**
   * Resolve a single id → display name.
   * Unknown / unloaded kinds and missing records return the id itself.
   */
  async resolve(
    kind: EntityKind,
    id: string | null | undefined
  ): Promise<string> {
    const normalized = normalizeId(id);
    if (!normalized) return "";

    const directory = await ensureDirectory(kind);
    return directory.get(normalized) ?? normalized;
  },

  /** Batch resolve (shares one directory load per kind). */
  async resolveMany(
    kind: EntityKind,
    ids: Array<string | null | undefined>
  ): Promise<string[]> {
    const directory = await ensureDirectory(kind);
    return ids.map((id) => {
      const normalized = normalizeId(id);
      if (!normalized) return "";
      return directory.get(normalized) ?? normalized;
    });
  },

  /** Richer result when callers need resolved vs fallback. */
  async resolveDetails(
    kind: EntityKind,
    id: string | null | undefined
  ): Promise<ResolvedEntity> {
    const normalized = normalizeId(id);
    if (!normalized) {
      return { kind, id: "", name: "", resolved: false };
    }

    const directory = await ensureDirectory(kind);
    const name = directory.get(normalized);
    return {
      kind,
      id: normalized,
      name: name ?? normalized,
      resolved: Boolean(name),
    };
  },

  async resolveUser(id: string | null | undefined): Promise<string> {
    return EntityResolver.resolve(EntityKinds.user, id);
  },

  async resolveFacility(id: string | null | undefined): Promise<string> {
    return EntityResolver.resolve(EntityKinds.facility, id);
  },

  async resolveAsset(id: string | null | undefined): Promise<string> {
    return EntityResolver.resolve(EntityKinds.asset, id);
  },

  /** Warm cache for a kind (or all registered kinds). */
  async prefetch(kind?: EntityKind): Promise<void> {
    if (kind) {
      await ensureDirectory(kind);
      return;
    }
    await Promise.all(
      listEntityRegistrations().map((entry) => ensureDirectory(entry.kind))
    );
  },

  /** Drop cached directories (call after create/update/deactivate of that kind). */
  invalidate(kind?: EntityKind): void {
    if (kind) {
      directories.delete(kind);
      inflight.delete(kind);
      return;
    }
    directories.clear();
    inflight.clear();
  },

  /** Sync cache peek — undefined if directory not loaded or id missing. */
  getCached(kind: EntityKind, id: string | null | undefined): string | undefined {
    const normalized = normalizeId(id);
    if (!normalized) return undefined;
    return directories.get(kind)?.get(normalized);
  },
};

export type IEntityResolver = typeof EntityResolver;
