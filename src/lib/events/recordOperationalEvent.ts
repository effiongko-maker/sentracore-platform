/**
 * Operational event recording (server-only).
 *
 * Events are append-only history — not primary business records.
 * Module tables own domain entities; call this after those writes succeed.
 */

export type OperationalEventSource =
  | "user"
  | "system"
  | "automation"
  | "integration"
  | "ai";

export type RecordOperationalEventInput = {
  organisationId: string;
  moduleId: string;
  eventType: string;
  departmentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
  source?: OperationalEventSource;
  /** Defaults to now (UTC). */
  occurredAt?: string;
};

export type RecordedOperationalEvent = {
  id: string;
  organisationId: string;
  departmentId: string | null;
  moduleId: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  actorProfileId: string | null;
  occurredAt: string;
  data: Record<string, unknown>;
  source: OperationalEventSource;
  createdAt: string;
};

type EventRow = {
  id: string;
  organisation_id: string;
  department_id: string | null;
  module_id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_profile_id: string | null;
  occurred_at: string;
  data: Record<string, unknown> | null;
  source: OperationalEventSource;
  created_at: string;
};

function mapRow(row: EventRow): RecordedOperationalEvent {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    departmentId: row.department_id,
    moduleId: row.module_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorProfileId: row.actor_profile_id,
    occurredAt: row.occurred_at,
    data: row.data ?? {},
    source: row.source,
    createdAt: row.created_at,
  };
}

function toInsertPayload(input: RecordOperationalEventInput) {
  const eventType = input.eventType.trim();
  if (!eventType) {
    throw new Error("eventType is required");
  }

  const entityType = input.entityType?.trim() || null;
  const entityId = input.entityId ?? null;

  if ((entityType == null) !== (entityId == null)) {
    throw new Error("entityType and entityId must both be set or both be null");
  }

  return {
    organisation_id: input.organisationId,
    department_id: input.departmentId ?? null,
    module_id: input.moduleId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    data: input.data ?? {},
    source: input.source ?? "user",
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  };
}

/**
 * Record an event as the signed-in user.
 * actor_profile_id is forced to auth.uid() by the database trigger.
 */
export async function recordOperationalEvent(
  input: RecordOperationalEventInput
): Promise<RecordedOperationalEvent> {
  const { cookies } = await import("next/headers");
  const { createClient } = await import("@/utils/supabase/server");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized: no authenticated session");
  }

  const payload = toInsertPayload({
    ...input,
    source: input.source ?? "user",
  });

  const { data, error } = await supabase
    .from("operational_events")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[recordOperationalEvent] Supabase insert failed", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      payload: {
        organisation_id: payload.organisation_id,
        module_id: payload.module_id,
        department_id: payload.department_id,
        event_type: payload.event_type,
        entity_type: payload.entity_type,
        entity_id: payload.entity_id,
        entity_id_type: typeof payload.entity_id,
        source: payload.source,
        // actor_profile_id is set by DB trigger from auth.uid(); session user:
        sessionUserId: user.id,
      },
    });
    throw new Error(error?.message ?? "Failed to record operational event");
  }

  return mapRow(data as EventRow);
}

export type RecordSystemOperationalEventInput = RecordOperationalEventInput & {
  /** Optional explicit actor for trusted/system pathways; null = system. */
  actorProfileId?: string | null;
  source?: Exclude<OperationalEventSource, "user"> | "user";
};

/**
 * Trusted server/system pathway (service role).
 * Use for automation, integrations, AI, and system-generated events.
 * Never import/call from client components.
 */
export async function recordSystemOperationalEvent(
  input: RecordSystemOperationalEventInput
): Promise<RecordedOperationalEvent> {
  const { createAdminClient } = await import("@/utils/supabase/admin");
  const admin = createAdminClient();

  const payload = {
    ...toInsertPayload({
      ...input,
      source: input.source ?? "system",
    }),
    actor_profile_id: input.actorProfileId ?? null,
  };

  const { data, error } = await admin
    .from("operational_events")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to record system operational event"
    );
  }

  return mapRow(data as EventRow);
}
