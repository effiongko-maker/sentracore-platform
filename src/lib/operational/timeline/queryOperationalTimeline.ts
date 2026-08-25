import { ActionError } from "@/lib/actions/errors";
import { OPERATIONAL_LIFECYCLE_EVENT_TYPES } from "@/lib/events/taxonomy";
import {
  matchesTimelineQuery,
  normalizeOperationalTimelineEvent,
} from "./normalizeOperationalTimelineEvent";
import type {
  LifecycleEventRow,
  OperationalTimelineEvent,
  OperationalTimelineQuery,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT = 500;

/**
 * Load normalised operational lifecycle events for chronological reconstruction.
 * Filters in-memory on relationship fields so linked incidents/maintenance/WOs
 * are included even when entity_id is the source entity.
 */
export async function queryOperationalTimeline(
  supabase: SupabaseClient,
  query: OperationalTimelineQuery
): Promise<OperationalTimelineEvent[]> {
  const limit = query.limit ?? DEFAULT_LIMIT;

  let request = supabase
    .from("operational_events")
    .select("id, event_type, entity_type, entity_id, occurred_at, data")
    .eq("organisation_id", query.organisationId)
    .in("event_type", [...OPERATIONAL_LIFECYCLE_EVENT_TYPES])
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 2000));

  if (query.fromIso) {
    request = request.gte("occurred_at", query.fromIso);
  }
  if (query.toIso) {
    request = request.lte("occurred_at", query.toIso);
  }

  const { data, error } = await request;

  if (error) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Failed to load operational timeline.",
      { cause: error }
    );
  }

  const events = ((data ?? []) as LifecycleEventRow[])
    .map(normalizeOperationalTimelineEvent)
    .filter((event): event is OperationalTimelineEvent => event != null)
    .filter((event) =>
      matchesTimelineQuery(event, {
        facilityId: query.facilityId,
        assetId: query.assetId,
        incidentId: query.incidentId,
        maintenanceId: query.maintenanceId,
        workOrderId: query.workOrderId,
      })
    );

  events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  return events;
}
