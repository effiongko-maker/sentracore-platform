import { boundaryAllows, boundaryForSession } from "@/lib/access/moduleBoundary";
import {
  getPlatformSession,
  toSessionIdentity,
} from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/types";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  applyPlatformSuperAdmin,
  accessCan,
  isInactiveUserStatus,
  resolveOperatingAccessFromGrants,
  type OperatingAccess,
} from "./resolveAccess";
import {
  FM_FACILITY_CONTEXT_COOKIE,
  type AuthorisedFacility,
  type FmFacilityScopeMode,
} from "./facilityScope";
import {
  FM_EXPLICIT_GRANT_CAPABILITIES,
  type AccessCapability,
} from "./capabilities";
import { isPlatformSuperAdminFromSlugs } from "./platformRoles";
import {
  isV1OperatingRole,
  parseV1OperatingRole,
  v1OperatingRoleLabel,
  type V1OperatingRole,
} from "./roles";

function isFmGrantCapability(value: string): value is AccessCapability {
  return (FM_EXPLICIT_GRANT_CAPABILITIES as readonly string[]).includes(value);
}

async function loadExplicitFmGrants(
  organisationId: string,
  profileId: string
): Promise<AccessCapability[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_capability_grants")
    .select("capability")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId);
  if (error) {
    throw error;
  }
  const granted: AccessCapability[] = [];
  for (const row of data ?? []) {
    const capability = String(
      (row as { capability?: string }).capability ?? ""
    );
    if (isFmGrantCapability(capability)) {
      granted.push(capability);
    }
  }
  return granted;
}

async function loadActiveAssignmentContext(
  organisationId: string,
  profileId: string
): Promise<{
  role: V1OperatingRole | null;
  facility: string;
  facilityId: string;
  status: OperatingAccess["status"];
  /** Every ACTIVE facility the profile holds an active assignment at (most recently updated first). */
  assigned: AuthorisedFacility[];
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fm_facility_assignments")
    .select("operational_role, status, facility_id, updated_at, fm_facilities ( id, name, code, status )")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) {
    throw error;
  }
  type Row = {
    operational_role?: string;
    facility_id?: string;
    fm_facilities?: { id?: string; name?: string; code?: string; status?: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const assigned: AuthorisedFacility[] = [];
  for (const r of rows) {
    const f = Array.isArray(r.fm_facilities) ? r.fm_facilities[0] : r.fm_facilities;
    if (!f?.id || f.status !== "active" || assigned.some((a) => a.id === f.id)) continue;
    assigned.push({ id: String(f.id), name: String(f.name ?? ""), code: f.code ? String(f.code) : undefined });
  }
  // The primary (most recently updated) assignment keeps its existing meaning: operating role + default facility.
  const row = rows[0];
  if (!row) {
    return { role: null, facility: "", facilityId: "", status: "unknown", assigned };
  }
  const rawRole = String(row.operational_role ?? "");
  const role = isV1OperatingRole(rawRole)
    ? rawRole
    : parseV1OperatingRole(rawRole);
  const primary = Array.isArray(row.fm_facilities) ? row.fm_facilities[0] : row.fm_facilities;
  return {
    role,
    facility: String(primary?.name ?? ""),
    facilityId: String(row.facility_id ?? ""),
    status: "active",
    assigned,
  };
}

/**
 * The explicit organisation-wide facility scope (profiles.fm_facility_scope). Fails closed to "assigned" when the
 * value is absent or unreadable — never widened by an error.
 */
async function loadFacilityScopeMode(organisationId: string, profileId: string): Promise<FmFacilityScopeMode> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("fm_facility_scope")
    .eq("organisation_id", organisationId)
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    console.warn("[access] facility scope unavailable; using assigned facilities only", error.message);
    return "assigned";
  }
  return (data as { fm_facility_scope?: string } | null)?.fm_facility_scope === "all" ? "all" : "assigned";
}

async function loadActiveFacilities(organisationId: string): Promise<AuthorisedFacility[]> {
  const { data, error } = await createAdminClient()
    .from("fm_facilities")
    .select("id, name, code")
    .eq("organisation_id", organisationId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).map((f) => ({ id: String(f.id), name: String(f.name ?? ""), code: f.code ? String(f.code) : undefined }));
}

/** The user's requested workspace facility (untrusted; validated against access by the resolver). */
async function readRequestedFacilityContext(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(FM_FACILITY_CONTEXT_COOKIE)?.value ?? null;
  } catch {
    return null; // outside a request (scripts / background work): default selection
  }
}

/**
 * Resolve FM operating access from platform identity + explicit IAM grants.
 * Does not query Apps Script USERS. Does not use email fallback.
 * operational_identity_links is not an authorization source.
 */
export async function resolveOperatingAccess(
  session: PlatformSession
): Promise<OperatingAccess> {
  const identity = toSessionIdentity(session);
  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;
  const profileId = session.profile.id;
  const isSuperAdmin = isPlatformSuperAdminFromSlugs(session.roleSlugs);

  // Module-bound boundary: outside Facility Management, FM authority is zero — whatever
  // explicit grants exist. Fail closed; never widened by an accidental grant.
  if (!boundaryAllows(boundaryForSession(session), "facility_management")) {
    return resolveOperatingAccessFromGrants({
      email: identity.email,
      name: identity.name,
      role: null,
      roleLabel: "Restricted to another module",
      status: "unknown",
      unassigned: true,
      capabilities: [],
      profileId,
    });
  }

  if (session.profile.status !== "active") {
    const inactive =
      session.profile.status === "inactive" ||
      session.profile.status === "suspended";
    return resolveOperatingAccessFromGrants({
      email: identity.email,
      name: identity.name,
      role: null,
      roleLabel:
        session.profile.status === "suspended"
          ? "Suspended"
          : session.profile.status === "inactive"
            ? "Inactive"
            : "Invited",
      status:
        session.profile.status === "inactive" ||
        session.profile.status === "suspended"
          ? session.profile.status
          : "unknown",
      unassigned: true,
      inactive,
      capabilities: [],
      profileId,
    });
  }

  if (!organisationId || !profileId) {
    const base = resolveOperatingAccessFromGrants({
      email: identity.email,
      name: identity.name,
      role: null,
      unassigned: true,
      capabilities: [],
      profileId,
    });
    return applyPlatformSuperAdmin(base, isSuperAdmin);
  }

  let capabilities: AccessCapability[] = [];
  let role: V1OperatingRole | null = null;
  let facility = "";
  let facilityId = "";
  let assignmentStatus: OperatingAccess["status"] = "unknown";
  let authorisedFacilities: AuthorisedFacility[] = [];

  // Grants and assignment context are independent (both keyed on org + profile).
  // Each keeps its own failure semantics: grants fail closed, assignment degrades.
  const [grantsResult, contextResult, scopeModeResult, requestedFacilityContext] = await Promise.allSettled([
    loadExplicitFmGrants(organisationId, profileId),
    loadActiveAssignmentContext(organisationId, profileId),
    loadFacilityScopeMode(organisationId, profileId),
    readRequestedFacilityContext(),
  ]);
  let facilityScopeMode: FmFacilityScopeMode =
    scopeModeResult.status === "fulfilled" ? scopeModeResult.value : "assigned";

  if (grantsResult.status === "fulfilled") {
    capabilities = grantsResult.value;
  } else {
    console.warn(
      "[access] platform capability grants unavailable; denying FM business capabilities",
      grantsResult.reason
    );
    capabilities = [];
  }

  if (contextResult.status === "fulfilled") {
    const context = contextResult.value;
    role = context.role;
    facility = context.facility;
    facilityId = context.facilityId;
    assignmentStatus = context.status;
    authorisedFacilities = context.assigned;
  } else {
    console.warn(
      "[access] facility assignment context unavailable; continuing with grants only",
      contextResult.reason
    );
  }

  if (facilityScopeMode === "all") {
    try {
      authorisedFacilities = await loadActiveFacilities(organisationId);
    } catch (error) {
      console.warn("[access] active facilities unavailable; all-facilities scope degraded to assigned", error);
      facilityScopeMode = "assigned"; // never unrestricted on a failed read
    }
  }

  const base = resolveOperatingAccessFromGrants({
    email: identity.email,
    name: identity.name,
    role,
    roleLabel: role ? v1OperatingRoleLabel(role) : "Unassigned",
    status: assignmentStatus,
    facility,
    facilityId,
    facilityScopeMode,
    authorisedFacilities,
    requestedFacilityContext:
      requestedFacilityContext.status === "fulfilled" ? requestedFacilityContext.value : null,
    inactive: isInactiveUserStatus(session.profile.status),
    unassigned: role == null,
    capabilities,
    profileId,
  });

  return applyPlatformSuperAdmin(base, isSuperAdmin);
}

export async function getOperatingAccess(): Promise<OperatingAccess | null> {
  const session = await getPlatformSession();
  if (!session) return null;
  return resolveOperatingAccess(session);
}

export class AccessDeniedError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export async function requireCapability(
  capability: AccessCapability
): Promise<{ session: PlatformSession; access: OperatingAccess }> {
  const session = await getPlatformSession();
  if (!session) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  const access = await resolveOperatingAccess(session);
  if (!accessCan(access, capability)) {
    throw new AccessDeniedError(
      access.inactive
        ? "Your user account is inactive."
        : `Missing capability: ${capability}`
    );
  }
  return { session, access };
}

/** Mutation actions that must not run without an explicit capability. */
export function isWriteAction(action: string): boolean {
  return (
    action === "create" ||
    action === "update" ||
    action === "deactivate" ||
    action === "delete"
  );
}
