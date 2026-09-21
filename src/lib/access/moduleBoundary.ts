import { ActionError } from "@/lib/actions/errors";
import { MODULE_BOUND_HOME_IDS, WORKSPACE_REGISTRY, type BoundHomeId } from "@/lib/access/workspaceRegistry";

/**
 * Module-bound platform identities.
 *
 * An ACCESS-SCOPE concept stored on the profile (access_scope / home_module) and
 * changed only through the audited platform IAM control plane. It is an UPPER
 * BOUNDARY: capabilities still decide what a user may do INSIDE a module, but a
 * module-bound identity can never act outside its home module, whatever grants it
 * holds. Operational/job role never implies module-bound scope.
 */

/** Derived from the workspace registry (workspaceRegistry.ts) — the only place a home workspace is defined. */
export const BOUND_MODULES = MODULE_BOUND_HOME_IDS;
export type BoundModule = BoundHomeId;
export type AccessScope = "platform" | "module";

/** What a gate protects: one operational module, or platform-wide surfaces. */
export type BoundaryTarget = BoundModule | "platform";

export type ModuleBoundary = {
  scope: AccessScope;
  homeModule: BoundModule | null;
  /** False for any inconsistent configuration — the boundary then denies everything (fail closed). */
  valid: boolean;
};

export const MODULE_HOME_ROUTE = Object.fromEntries(
  WORKSPACE_REGISTRY.filter((w) => w.moduleBoundHome).map((w) => [w.id, w.route])
) as Record<BoundModule, string>;

export const MODULE_LABEL = Object.fromEntries(
  WORKSPACE_REGISTRY.filter((w) => w.moduleBoundHome).map((w) => [w.id, w.label])
) as Record<BoundModule, string>;

export function isBoundModule(value: unknown): value is BoundModule {
  return typeof value === "string" && (BOUND_MODULES as readonly string[]).includes(value);
}

export function resolveModuleBoundary(input: {
  accessScope?: string | null;
  homeModule?: string | null;
}): ModuleBoundary {
  const scope = input.accessScope ?? "platform";
  const home = input.homeModule ?? null;
  if (scope === "platform") {
    return home === null
      ? { scope: "platform", homeModule: null, valid: true }
      // Platform scope must never carry a home module.
      : { scope: "platform", homeModule: null, valid: false };
  }
  if (scope === "module" && isBoundModule(home)) {
    return { scope: "module", homeModule: home, valid: true };
  }
  return { scope: "module", homeModule: null, valid: false };
}

export function boundaryAllows(boundary: ModuleBoundary, target: BoundaryTarget): boolean {
  if (!boundary.valid) return false;
  if (boundary.scope === "platform") return true;
  return target === boundary.homeModule;
}

type SessionLike = { profile: { accessScope?: string | null; homeModule?: string | null } };

export function boundaryForSession(session: SessionLike): ModuleBoundary {
  return resolveModuleBoundary({
    accessScope: session.profile.accessScope,
    homeModule: session.profile.homeModule,
  });
}

/** Server-side gate: refuses (fail closed) anything outside the identity's boundary. */
export function assertBoundaryAllows(session: SessionLike, target: BoundaryTarget): void {
  const boundary = boundaryForSession(session);
  if (boundaryAllows(boundary, target)) return;
  if (!boundary.valid) {
    throw new ActionError("FORBIDDEN", "Your account's access scope is misconfigured. Contact an administrator.");
  }
  throw new ActionError(
    "FORBIDDEN",
    boundary.homeModule
      ? `Your account is restricted to ${MODULE_LABEL[boundary.homeModule]}.`
      : "Your account is restricted."
  );
}

/** Where a module-bound identity lands; null for platform scope or an invalid configuration. */
export function homeRouteForBoundary(boundary: ModuleBoundary): string | null {
  return boundary.valid && boundary.scope === "module" && boundary.homeModule
    ? MODULE_HOME_ROUTE[boundary.homeModule]
    : null;
}
