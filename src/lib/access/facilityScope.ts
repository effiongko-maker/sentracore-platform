/**
 * FM facility scope — WHERE a user may operate (capabilities decide WHAT they may do).
 *
 * Sources (existing IAM, extended minimally):
 *  - fm_facility_assignments (active)  → the facilities an "assigned"-scope user may operate in;
 *  - profiles.fm_facility_scope = "all" → an explicit organisation-wide facility scope (every active facility);
 *  - the workspace facility context (a per-user selection, validated here on every request) narrows the view to
 *    one authorised facility or "All facilities".
 *
 * Records with no facility fall into two kinds — never treated as any particular facility:
 *  - facility-scoped operational records without a facility (e.g. imported Approvals with no facility-bearing parent)
 *    are visible in "All facilities" only;
 *  - FM-WIDE records (Client Payments with no facility — commercial obligations not attributable to one facility)
 *    are visible in EVERY authorised facility context, subject to normal capability checks (scopeAllowsFmWide).
 *
 * Pure and framework-free: used by the access resolver, repositories, API routes and client UI.
 */

export type FmFacilityScopeMode = "assigned" | "all";

export type AuthorisedFacility = { id: string; name: string; code?: string };

/** Server-enforced read scope for FM records. */
export type FmFacilityScope =
  | { unrestricted: true }
  | { unrestricted: false; facilityIds: string[]; includeUnattributed: boolean };

export const ALL_FACILITIES = "all";
export const FM_FACILITY_CONTEXT_COOKIE = "sc_fm_facility";
/** A UUID no row can have — used to express "match nothing" in a PostgREST filter. */
export const NO_FACILITY_MATCH = "00000000-0000-0000-0000-000000000000";

export type WorkspaceFacilityContext = {
  /** Effective selection: "all" or an authorised facility UUID. */
  selection: string;
  /** True when "All facilities" is offered (multiple authorised facilities, or all-facilities scope). */
  allowAll: boolean;
  /** Authorised facilities the user may switch to (and create in). */
  options: AuthorisedFacility[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the workspace facility context and the enforced read scope from the user's authorised facilities, their
 * scope mode and their (untrusted) requested selection. A requested facility outside the authorised set is ignored.
 */
export function resolveWorkspaceFacility(input: {
  authorised: AuthorisedFacility[];
  mode: FmFacilityScopeMode;
  requested?: string | null;
}): { context: WorkspaceFacilityContext; scope: FmFacilityScope } {
  const options = [...input.authorised].sort((a, b) => a.name.localeCompare(b.name));
  const allowAll = input.mode === "all" || options.length > 1;
  const requested = (input.requested ?? "").trim();
  const requestedFacility = UUID_RE.test(requested) ? options.find((f) => f.id === requested) : undefined;

  let selection: string;
  if (requestedFacility) selection = requestedFacility.id;
  else if (allowAll) selection = ALL_FACILITIES;
  else if (options.length === 1) selection = options[0]!.id;
  else selection = ALL_FACILITIES; // no authorised facility: only facility-less records remain visible

  const scope: FmFacilityScope =
    selection !== ALL_FACILITIES
      ? { unrestricted: false, facilityIds: [selection], includeUnattributed: false }
      : input.mode === "all"
        ? { unrestricted: true }
        : { unrestricted: false, facilityIds: options.map((f) => f.id), includeUnattributed: true };

  return { context: { selection, allowAll, options }, scope };
}

/**
 * Does the scope admit a record attributed to these facilities? A record with no facility (all entries empty) is
 * facility-less. A multi-facility record is admitted when ANY of its facilities is in scope.
 */
export function scopeAllowsFacilities(scope: FmFacilityScope, facilityIds: Array<string | null | undefined>): boolean {
  if (scope.unrestricted) return true;
  const ids = facilityIds.map((id) => (id ?? "").trim()).filter(Boolean);
  if (ids.length === 0) return scope.includeUnattributed;
  return ids.some((id) => scope.facilityIds.includes(id));
}

/**
 * PostgREST `or` clause restricting `column` to the scope; null when unrestricted. `extraIdClause` lets a caller
 * admit rows matched another way (e.g. multi-facility Work via fm_work_facilities: "id.in.(…)").
 */
export function facilityScopeClause(scope: FmFacilityScope, column = "facility_id", extraClauses: string[] = []): string | null {
  if (scope.unrestricted) return null;
  const parts: string[] = [];
  if (scope.facilityIds.length) parts.push(`${column}.in.(${scope.facilityIds.join(",")})`);
  if (scope.includeUnattributed) parts.push(`${column}.is.null`);
  parts.push(...extraClauses);
  return parts.length ? parts.join(",") : `${column}.eq.${NO_FACILITY_MATCH}`;
}

/**
 * FM-wide records (e.g. Client Payments): no facility ⇒ visible in every authorised facility context; a facility ⇒
 * normal facility scope.
 */
export function scopeAllowsFmWide(scope: FmFacilityScope, facilityId: string | null | undefined): boolean {
  return !(facilityId ?? "").trim() || scopeAllowsFacilities(scope, [facilityId]);
}

/** PostgREST clause for FM-wide tables: rows with no facility are always admitted. */
export function fmWideScopeClause(scope: FmFacilityScope, column = "facility_id"): string | null {
  return facilityScopeClause(scope, column, [`${column}.is.null`]);
}

/** Apply the scope to a supabase-js filter builder (no-op when unrestricted). */
export function applyFacilityScope<Q extends { or: (filters: string) => Q }>(
  query: Q,
  scope: FmFacilityScope | undefined,
  column = "facility_id",
  extraClauses: string[] = []
): Q {
  if (!scope) return query;
  const clause = facilityScopeClause(scope, column, extraClauses);
  return clause ? query.or(clause) : query;
}

/** May the user CREATE a record in this facility? Any authorised facility (independent of the current view). */
export function canOperateInFacility(
  input: { mode: FmFacilityScopeMode; authorised: AuthorisedFacility[] },
  facilityId: string | null | undefined
): boolean {
  const id = (facilityId ?? "").trim();
  if (!id) return false;
  return input.mode === "all" || input.authorised.some((f) => f.id === id);
}

/** Unrestricted scope for internal/system contexts that are not a signed-in operator (e.g. occupant portal). */
export const UNRESTRICTED_FACILITY_SCOPE: FmFacilityScope = { unrestricted: true };

/** What a repository enforces: the read scope, and which facilities a record may be CREATED in. */
export type FmRepoScope = {
  read: FmFacilityScope;
  canOperateIn: (facilityId: string | null | undefined) => boolean;
};

export const UNRESTRICTED_REPO_SCOPE: FmRepoScope = { read: UNRESTRICTED_FACILITY_SCOPE, canOperateIn: () => true };

/**
 * Repository scope for a signed-in operator. `undefined` access = an internal/system context that is not a
 * signed-in operator (e.g. occupant portal submission) — unrestricted, exactly as before.
 */
export function repoScopeFromAccess(
  access?: { fmFacilityScope: FmFacilityScope; facilityScopeMode: FmFacilityScopeMode; authorisedFacilities: AuthorisedFacility[] } | null
): FmRepoScope {
  if (!access) return UNRESTRICTED_REPO_SCOPE;
  return {
    read: access.fmFacilityScope,
    canOperateIn: (facilityId) =>
      canOperateInFacility({ mode: access.facilityScopeMode, authorised: access.authorisedFacilities }, facilityId),
  };
}
