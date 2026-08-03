/**
 * Open entity kind — new modules register new string keys.
 * Prefer shared constants (EntityKinds.*) over magic strings at call sites.
 */
export type EntityKind = string;

export interface EntityResolverRegistration {
  /** Unique kind key, e.g. "user" | "facility" | "asset" | "vendor". */
  kind: EntityKind;
  /**
   * Human label for docs/debug only (e.g. "User").
   * Missing records still fall back to the raw id, never throw.
   */
  label: string;
  /**
   * Load id → display name for the whole directory.
   * Called at most once per kind until invalidate(kind).
   */
  loadDirectory: () => Promise<Map<string, string>>;
}

export interface ResolvedEntity {
  kind: EntityKind;
  id: string;
  name: string;
  /** True when name came from cache/directory; false when falling back to id. */
  resolved: boolean;
}
