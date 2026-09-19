import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { UUID_RE } from "./fmRequestDomain";

/**
 * Anonymous occupant-portal intake has no session, so the tenant cannot come
 * from one. The tenant is derived server-side from ONE configured portal
 * facility (a real fm_facilities UUID). The client never chooses the
 * organisation, and may only name that same facility.
 *
 * Default: NCC Annex (display code FAC-0001). Override per deployment with
 * OCCUPANT_PORTAL_FACILITY_ID. The display code is not an identity.
 */
export const DEFAULT_OCCUPANT_PORTAL_FACILITY_ID =
  "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";

export type OccupantPortalTarget = {
  organisationId: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  location: string;
  facilityType: string;
};

export class OccupantPortalUnavailableError extends Error {
  constructor(message = "The request portal is unavailable right now.") {
    super(message);
    this.name = "OccupantPortalUnavailableError";
  }
}

export function configuredPortalFacilityId(): string {
  const configured = process.env.OCCUPANT_PORTAL_FACILITY_ID?.trim();
  const id = configured || DEFAULT_OCCUPANT_PORTAL_FACILITY_ID;
  if (!UUID_RE.test(id)) {
    throw new OccupantPortalUnavailableError();
  }
  return id;
}

/**
 * Resolve the portal target. Failure is an explicit error — never an empty
 * catalogue and never a fabricated facility.
 */
export async function loadOccupantPortalTarget(): Promise<OccupantPortalTarget> {
  const facilityId = configuredPortalFacilityId();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    throw new OccupantPortalUnavailableError();
  }

  const { data: facility, error } = await admin
    .from("fm_facilities")
    .select("id, organisation_id, code, name, status, facility_type, location_text")
    .eq("id", facilityId)
    .maybeSingle();
  if (error) throw new OccupantPortalUnavailableError();
  if (!facility || facility.status !== "active") {
    throw new OccupantPortalUnavailableError();
  }

  const { data: organisation, error: orgError } = await admin
    .from("organisations")
    .select("id, status")
    .eq("id", facility.organisation_id)
    .maybeSingle();
  if (orgError || !organisation || organisation.status !== "active") {
    throw new OccupantPortalUnavailableError();
  }

  return {
    organisationId: String(facility.organisation_id),
    facilityId: String(facility.id),
    facilityCode: String(facility.code),
    facilityName: String(facility.name),
    location: facility.location_text ? String(facility.location_text) : "",
    facilityType: facility.facility_type ? String(facility.facility_type) : "office",
  };
}

/** Anonymous callers may only address the configured portal facility. */
export function assertPortalFacility(
  target: OccupantPortalTarget,
  requestedFacility: string
): void {
  const requested = requestedFacility.trim().toLowerCase();
  if (
    !requested ||
    (requested !== target.facilityId.toLowerCase() &&
      requested !== target.facilityCode.toLowerCase())
  ) {
    throw new OccupantPortalUnavailableError(
      "This facility is not available for portal requests."
    );
  }
}
