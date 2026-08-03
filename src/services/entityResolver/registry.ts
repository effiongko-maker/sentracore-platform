import type { EntityKind, EntityResolverRegistration } from "./types";

const registrations = new Map<EntityKind, EntityResolverRegistration>();

/**
 * Register an entity resolver plugin.
 * Adding a new entity type = one registerEntityResolver() call.
 * Does not require changing EntityResolver core.
 */
export function registerEntityResolver(
  registration: EntityResolverRegistration
): void {
  if (!registration.kind) {
    throw new Error("EntityResolver registration requires a kind.");
  }
  if (typeof registration.loadDirectory !== "function") {
    throw new Error(
      `EntityResolver registration "${registration.kind}" requires loadDirectory.`
    );
  }
  registrations.set(registration.kind, registration);
}

export function getEntityRegistration(
  kind: EntityKind
): EntityResolverRegistration | undefined {
  return registrations.get(kind);
}

export function listEntityRegistrations(): EntityResolverRegistration[] {
  return Array.from(registrations.values());
}
