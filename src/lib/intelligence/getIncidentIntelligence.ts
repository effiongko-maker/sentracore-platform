import { ActionError } from "@/lib/actions/errors";
import { getPlatformSession } from "@/lib/auth/session";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventIntelligence } from "./getEventIntelligence";
import type { EventIntelligence } from "./types";

type IncidentEventRow = {
  id: string;
  organisation_id: string;
  occurred_at: string;
  created_at: string;
};

/**
 * Canonical intelligence root for an incident:
 * earliest facility.incident_reported with entity_type=incident and entity_id=incidentId
 * within the caller's organisation.
 *
 * Deterministic order: occurred_at ASC, created_at ASC, id ASC.
 * Multiple matching rows are possible (no uniqueness on entity pair).
 */
export async function resolveCanonicalIncidentReportedEvent(options: {
  supabase: SupabaseClient;
  organisationId: string;
  incidentId: string;
}): Promise<IncidentEventRow | null> {
  const { supabase, organisationId, incidentId } = options;

  const { data, error } = await supabase
    .from("operational_events")
    .select("id, organisation_id, occurred_at, created_at")
    .eq("organisation_id", organisationId)
    .eq("event_type", OperationalEventTypes.FACILITY_INCIDENT_REPORTED)
    .eq("entity_type", "incident")
    .eq("entity_id", incidentId)
    .order("occurred_at", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Failed to resolve incident operational event.",
      { cause: error }
    );
  }

  return (data as IncidentEventRow | null) ?? null;
}

/**
 * Domain facade: incidentId → canonical facility.incident_reported → EventIntelligence.
 * Does not duplicate Intelligence Read Model queries.
 */
export async function getIncidentIntelligence(
  incidentId: string
): Promise<EventIntelligence> {
  const trimmed = incidentId?.trim() ?? "";
  if (!trimmed) {
    throw new ActionError("VALIDATION_ERROR", "incidentId is required.");
  }

  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }
  if (!session.profile) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }
  if (
    session.profile.status === "suspended" ||
    session.profile.status === "inactive"
  ) {
    throw new ActionError("FORBIDDEN");
  }
  if (!session.organisation) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }
  if (session.organisation.status !== "active") {
    throw new ActionError("ORGANISATION_INACTIVE");
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const root = await resolveCanonicalIncidentReportedEvent({
    supabase,
    organisationId: session.organisation.id,
    incidentId: trimmed,
  });

  // Same non-leaking semantics as getEventIntelligence (missing / other-org).
  if (!root) {
    throw new ActionError(
      "FORBIDDEN",
      "Operational event was not found."
    );
  }

  return getEventIntelligence(root.id);
}

/**
 * Testable resolver + load path without Next cookies.
 * Delegates intelligence assembly to loadEventIntelligence via getEventIntelligence's assembler.
 */
export async function loadIncidentIntelligence(options: {
  supabase: SupabaseClient;
  organisationId: string;
  incidentId: string;
  facilityManagementEnabled: boolean;
  loadEventIntelligence: (args: {
    supabase: SupabaseClient;
    organisationId: string;
    eventId: string;
    facilityManagementEnabled: boolean;
  }) => Promise<EventIntelligence>;
}): Promise<EventIntelligence> {
  const trimmed = options.incidentId.trim();
  if (!trimmed) {
    throw new ActionError("VALIDATION_ERROR", "incidentId is required.");
  }

  const root = await resolveCanonicalIncidentReportedEvent({
    supabase: options.supabase,
    organisationId: options.organisationId,
    incidentId: trimmed,
  });

  if (!root || root.organisation_id !== options.organisationId) {
    throw new ActionError(
      "FORBIDDEN",
      "Operational event was not found."
    );
  }

  return options.loadEventIntelligence({
    supabase: options.supabase,
    organisationId: options.organisationId,
    eventId: root.id,
    facilityManagementEnabled: options.facilityManagementEnabled,
  });
}
