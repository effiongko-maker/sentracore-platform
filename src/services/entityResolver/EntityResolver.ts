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

/**
 * Kinds seeded from ReportingSnapshot.
 * Once primed, ensureDirectory never performs Apps Script list calls.
 */
const primedKinds = new Set<EntityKind>();

/** Diagnostic counter — network directory loads since last reset. */
let networkDirectoryLoads = 0;

function normalizeId(id: string | null | undefined): string {
  return String(id ?? "").trim();
}

function fieldOf(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = row[key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
  }
  const lowered = new Map(
    Object.keys(row).map((key) => [key.toLowerCase(), key] as const)
  );
  for (const key of keys) {
    const actual = lowered.get(key.toLowerCase());
    if (!actual) continue;
    const value = row[actual];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function upsertDirectory(
  kind: EntityKind,
  rows: unknown[],
  idKeys: string[],
  nameKeys: string[]
) {
  const map = new Map<string, string>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = fieldOf(row, idKeys);
    const name = fieldOf(row, nameKeys);
    if (!id || !name) continue;
    map.set(id, name);
  }
  directories.set(kind, map);
  primedKinds.add(kind);
  inflight.delete(kind);
}

async function ensureDirectory(kind: EntityKind): Promise<Map<string, string>> {
  // Snapshot-primed directories are authoritative — never fan out to Apps Script.
  if (primedKinds.has(kind)) {
    return directories.get(kind) ?? new Map();
  }

  const cached = directories.get(kind);
  if (cached) return cached;

  const pending = inflight.get(kind);
  if (pending) return pending;

  const registration = getEntityRegistration(kind);
  if (!registration) {
    const empty = new Map<string, string>();
    directories.set(kind, empty);
    return empty;
  }

  networkDirectoryLoads += 1;

  const load = registration
    .loadDirectory()
    .then((map) => {
      directories.set(kind, map);
      inflight.delete(kind);
      return map;
    })
    .catch((error) => {
      inflight.delete(kind);
      directories.set(kind, new Map());
      console.error(
        `[EntityResolver] Failed to load directory for "${kind}":`,
        error
      );
      return directories.get(kind)!;
    });

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
   * Seed directories from a ReportingSnapshot so Dashboard/Reports can resolve
   * names without additional Apps Script list calls.
   */
  primeFromReportingSnapshot(snapshot: {
    users?: unknown[];
    facilities?: unknown[];
    assets?: unknown[];
    workOrders?: unknown[];
    maintenance?: unknown[];
  }): void {
    upsertDirectory(EntityKinds.user, snapshot.users ?? [], ["id"], ["name"]);
    upsertDirectory(
      EntityKinds.facility,
      snapshot.facilities ?? [],
      ["id", "Facility ID"],
      ["name", "Facility Name"]
    );
    upsertDirectory(
      EntityKinds.asset,
      snapshot.assets ?? [],
      ["id", "Asset ID"],
      ["name", "Asset Name"]
    );
    upsertDirectory(
      EntityKinds.workOrder,
      snapshot.workOrders ?? [],
      ["id"],
      ["title", "name"]
    );
    upsertDirectory(
      EntityKinds.maintenance,
      snapshot.maintenance ?? [],
      ["id"],
      ["title", "name"]
    );
  },

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
      primedKinds.delete(kind);
      return;
    }
    directories.clear();
    inflight.clear();
    primedKinds.clear();
  },

  /** Sync cache peek — undefined if directory not loaded or id missing. */
  getCached(kind: EntityKind, id: string | null | undefined): string | undefined {
    const normalized = normalizeId(id);
    if (!normalized) return undefined;
    return directories.get(kind)?.get(normalized);
  },

  /** Test/diagnostics: Apps Script directory fan-out count. */
  getNetworkDirectoryLoadCount(): number {
    return networkDirectoryLoads;
  },

  /** Test/diagnostics: reset network load counter. */
  resetNetworkDirectoryLoadCount(): void {
    networkDirectoryLoads = 0;
  },
};

export type IEntityResolver = typeof EntityResolver;
